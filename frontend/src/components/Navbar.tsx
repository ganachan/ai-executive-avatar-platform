import Link from "next/link";
import { Bot, Video, Library, Settings } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="h-16 bg-surface-card border-b border-surface-border flex items-center px-6 gap-8 sticky top-0 z-40">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 text-white font-semibold text-lg hover:opacity-90">
        <div className="w-7 h-7 bg-msblue rounded-md flex items-center justify-center">
          <Bot size={16} className="text-white" />
        </div>
        <span>Executive Avatars</span>
        <span className="text-xs text-gray-500 font-normal hidden sm:block">by Microsoft</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1 ml-4">
        {[
          { href: "/studio", label: "Studio", icon: Video },
          { href: "/library", label: "Library", icon: Library },
          { href: "/admin", label: "Admin", icon: Settings },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 text-gray-400 hover:text-white hover:bg-surface-hover px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
