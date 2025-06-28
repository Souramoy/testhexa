import { useState } from "react";
import FileStructureView from "@/components/files/FileStructureView";
import { useFileSystem } from "@/context/FileContext";
import useResponsive from "@/hooks/useResponsive";
import { FileSystemItem } from "@/types/file";
import cn from "classnames";
import { BiArchiveIn } from "react-icons/bi";
import { TbFileUpload } from "react-icons/tb";
import { v4 as uuidV4 } from "uuid";
import { toast } from "react-hot-toast";
import { MdArticle } from "react-icons/md";

// ✅ Use import.meta.env for Vite or plain frontend
const GEMINI_API_KEY = "AIzaSyCawSfcZO21sDisBdRu71H5nSAD15d9zWc";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function FilesView() {
  const {
    downloadFilesAndFolders,
    updateDirectory,
    fileStructure
  } = useFileSystem();

  const { viewHeight } = useResponsive();
  const { minHeightReached } = useResponsive();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleOpenDirectory = async () => {
    try {
      setIsLoading(true);

      if ("showDirectoryPicker" in window) {
        try {
          const directoryHandle = await (window as any).showDirectoryPicker();

          const permissionHandle = directoryHandle as any;
          let permissionStatus: PermissionState = "prompt";

          if (typeof permissionHandle.queryPermission === "function") {
            permissionStatus = await permissionHandle.queryPermission({ mode: "read" });
          }

          if (permissionStatus !== "granted") {
            if (typeof permissionHandle.requestPermission === "function") {
              permissionStatus = await permissionHandle.requestPermission({ mode: "read" });
            } else {
              permissionStatus = "granted"; // fallback
            }
          }

          if (permissionStatus !== "granted") {
            throw new Error("Permission denied by user");
          }

          await processDirectoryHandle(directoryHandle);
          return;
        } catch (error) {
          console.error("Directory access error:", error);
          throw new Error(
            `Directory access failed: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      if ("webkitdirectory" in HTMLInputElement.prototype) {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.webkitdirectory = true;
        fileInput.multiple = true;

        fileInput.onchange = async (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            try {
              const structure = await readFileList(files);
              updateDirectory("", structure);
            } catch (error) {
              toast.error("Failed to process files");
              console.error("File processing error:", error);
            }
          }
        };

        fileInput.click();
        return;
      }

      toast.error("Your browser doesn't support folder access");
    } catch (error) {
      console.error("Directory error:", error);
      toast.error(`Failed to open folder: ${error instanceof Error ? error.message : "Please try again"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const processDirectoryHandle = async (directoryHandle: any) => {
    try {
      toast.loading("Reading folder contents...");
      const structure = await readDirectory(directoryHandle);
      updateDirectory("", structure);
      toast.dismiss();
      toast.success("Folder loaded successfully");
    } catch (error) {
      console.error("Processing error:", error);
      throw error;
    }
  };

  const readDirectory = async (directoryHandle: any): Promise<FileSystemItem[]> => {
    const children: FileSystemItem[] = [];
    const blacklist = ["node_modules", ".git", ".vscode", ".next", ".DS_Store"];

    const entries = [];
    for await (const entry of directoryHandle.values()) {
      entries.push(entry);
    }

    for (const entry of entries) {
      try {
        if (entry.kind === "file") {
          const file = await entry.getFile();
          children.push({
            id: uuidV4(),
            name: entry.name,
            type: "file",
            content: await readFileContent(file)
          });
        } else if (entry.kind === "directory" && !blacklist.includes(entry.name)) {
          children.push({
            id: uuidV4(),
            name: entry.name,
            type: "directory",
            children: await readDirectory(entry),
            isOpen: false
          });
        }
      } catch (error) {
        console.warn(`Skipping ${entry.name}:`, error);
      }
    }
    return children;
  };

  const readFileList = async (files: FileList): Promise<FileSystemItem[]> => {
    const items: FileSystemItem[] = [];
    const blacklist = ["node_modules", ".git", ".vscode", ".next", ".DS_Store"];
    const structure: Record<string, FileSystemItem[]> = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.webkitRelativePath;

      if (blacklist.some(term => path.includes(term))) continue;

      const parts = path.split("/");
      const filename = parts.pop()!;
      const dirPath = parts.join("/");

      if (!structure[dirPath]) {
        structure[dirPath] = [];
      }

      structure[dirPath].push({
        id: uuidV4(),
        name: filename,
        type: "file",
        content: await readFileContent(file)
      });
    }

    for (const [path, files] of Object.entries(structure)) {
      if (!path) {
        items.push(...files);
        continue;
      }

      const parts = path.split("/");
      let currentItems = items;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        let dir = currentItems.find(item => item.name === part && item.type === "directory");

        if (!dir) {
          dir = {
            id: uuidV4(),
            name: part,
            type: "directory",
            children: [],
            isOpen: false
          };
          currentItems.push(dir);
        }

        if (i === parts.length - 1) {
          dir.children = files;
        } else {
          currentItems = dir.children || [];
        }
      }
    }

    return items;
  };

  const readFileContent = async (file: File): Promise<string> => {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      return `[File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB]`;
    }

    try {
      return await file.text();
    } catch (error) {
      console.error(`Error reading ${file.name}:`, error);
      return `[Error reading file]`;
    }
  };

  const generateAndDownloadReadme = async () => {
    try {
      setIsGenerating(true);
      toast.loading("Generating README...");

      const currentStructure = fileStructure.children || [];
      const prompt = createReadmePrompt(currentStructure);

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 2048
          }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || "API request failed");
      }

      const { candidates } = await response.json();
      const readmeContent = candidates?.[0]?.content?.parts?.[0]?.text || "# Failed to generate README";

      updateDirectory("", [
        ...currentStructure,
        {
          id: uuidV4(),
          name: "README.md",
          type: "file",
          content: readmeContent
        }
      ]);

      const blob = new Blob([readmeContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "README.md";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      toast.success("README generated");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(`Failed to generate README: ${error instanceof Error ? error.message : "Try again"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const createReadmePrompt = (structure: FileSystemItem[]): string => {
    let summary = "Project Structure:\n\n";

    const traverse = (items: FileSystemItem[], depth = 0) => {
      for (const item of items) {
        summary += "  ".repeat(depth) + `- ${item.name}\n`;

        if (item.type === "directory" && item.children) {
          traverse(item.children, depth + 1);
        } else if (item.type === "file" && item.content) {
          if (/\.(js|ts|jsx|tsx|json)$/i.test(item.name)) {
            summary += "  ".repeat(depth + 1) + "```\n" +
              item.content.split("\n").slice(0, 15).join("\n") + "\n```\n\n";
          }
        }
      }
    };

    traverse(structure);

    return `Create a professional README.md for this codebase. Include:

1. Project Title (as H1 header)
2. Description (purpose and functionality)
3. Features (bullet points)
4. Installation (step-by-step)
5. Usage (with examples if applicable)
6. Configuration (environment variables, settings)
7. Contributing Guidelines
8. License (if detectable)

Format using Markdown with proper code blocks.

Here's the project structure and key file contents:
${summary}`;
  };

  return (
    <div
      className="flex select-none flex-col gap-1 px-4 py-2"
      style={{ height: viewHeight, maxHeight: viewHeight }}
    >
      <FileStructureView />
      <div
        className={cn(`flex min-h-fit flex-col justify-end pt-2`, {
          hidden: minHeightReached,
        })}
      >
        <hr />
        <button
          className="mt-2 flex w-full justify-start rounded-md p-2 transition-all hover:bg-darkHover"
          onClick={handleOpenDirectory}
          disabled={isLoading}
        >
          <TbFileUpload className="mr-2" size={24} />
          {isLoading ? "Loading..." : "Open Folder"}
        </button>
        <button
          className="flex w-full justify-start rounded-md p-2 transition-all hover:bg-darkHover"
          onClick={downloadFilesAndFolders}
        >
          <BiArchiveIn className="mr-2" size={22} /> Download Project
        </button>
        <button
          className="flex w-full justify-start rounded-md p-2 transition-all hover:bg-darkHover"
          onClick={generateAndDownloadReadme}
          disabled={isGenerating}
        >
          <MdArticle className="mr-2" size={22} />
          {isGenerating ? "Generating..." : "Create README"}
        </button>
      </div>
    </div>
  );
}

export default FilesView;
