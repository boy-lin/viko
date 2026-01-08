import { Home, Wrench, FileText, Plus } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-[#f0f0f3] border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-sm"></div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Wondershare</div>
            <div className="text-sm font-bold">UniConverter</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white text-gray-900 font-medium">
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-white/50">
          <Wrench className="w-5 h-5" />
          <span>AI Tools</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-white/50">
          <FileText className="w-5 h-5" />
          <span>My Files</span>
        </button>

        <div className="pt-4">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-gray-500 font-medium">
              Quick Access
            </span>
            <Plus className="w-4 h-4 text-gray-400" />
          </div>
          <div className="space-y-1 mt-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-white/50">
              <div className="w-5 h-5 text-purple-600">🔄</div>
              <span>Converter</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-white/50">
              <div className="w-5 h-5 text-orange-600">⬇️</div>
              <span>Downloader</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-white/50">
              <div className="w-5 h-5 text-blue-600">🗜️</div>
              <span>Compressor</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Promo Banner */}
      {/* <div className="m-3 mb-4">
        <div className="bg-gradient-to-br from-red-500 to-pink-500 rounded-xl p-4 text-white">
          <div className="text-lg font-bold mb-1">Happy New Year</div>
          <div className="text-3xl font-bold mb-3">30% OFF</div>
          <button className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-semibold py-2 px-4 rounded-lg">
            Save Now
          </button>
          <div className="mt-3 text-center">🎉</div>
        </div>
      </div> */}
    </aside>
  );
}
