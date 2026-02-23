import AVDownloaderIcon from "@/assets/av-downloader.jpg";
export const DownloaderLayer = () => {
  return (
    <div className="absolute bottom-0 left-4 right-4 h-40 translate-y-18 rounded-t-2xl bg-gradient-to-br from-orange-500 to-amber-400 p-6 transition-transform duration-[250ms] group-hover:translate-y-10 group-hover:rotate-[-1deg] group-hover:scale-105 flex items-center justify-center z-10">
      {/* <div className="relative w-32 h-32">
        <motion.div
          animate={{ y: [-5, 5, -5] }}
          transition={{
            duration: 3,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2"
        >
          <CloudIcon />
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{
            duration: 1.5,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="absolute top-12 left-1/2 -translate-x-1/2"
        >
          <DownloadArrowIcon />
        </motion.div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-around">
          <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-lg">
            ▶️
          </div>
          <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-lg">
            📱
          </div>
          <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-lg">
            🎬
          </div>
        </div>
      </div> */}
      <img src={AVDownloaderIcon} alt="av-converter" className="absolute inset-0 w-full h-full object-cover rounded-t-2xl " />
    </div>
  );
};
