function Footer() {
    return (
        <footer className="static bottom-1 left-0 flex w-full justify-center sm:fixed">
            <div className="flex w-full max-w-7xl items-center justify-between px-4 py-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    © {new Date().getFullYear()} My Website. All rights reserved.
                </span>
                <nav className="flex space-x-4">
                    <a href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">Privacy Policy</a>
                    <a href="/terms" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">Terms of Service</a>
                </nav>
            </div>
        </footer>
    )
}

export default Footer
