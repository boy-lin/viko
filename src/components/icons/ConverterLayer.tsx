import AvConverterIcon from "@/assets/av-converter.jpg";

export const ConverterLayer = () => {
  return (
    <div className="absolute bottom-0 left-4 right-4 h-40 translate-y-18 rounded-t-2xl bg-gradient-to-br from-purple-500 to-blue-500 p-6 transition-transform duration-[250ms] group-hover:translate-y-10 group-hover:rotate-[1deg] group-hover:scale-105 flex items-center justify-center z-10">
      <img src={AvConverterIcon} alt="av-converter" className="absolute inset-0 w-full h-full object-cover rounded-t-2xl " />
      {/* <div className="absolute top-4 right-4 space-y-2">
        <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-white">
          MP4
        </div>
        <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-white">
          AVI
        </div>
        <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-white">
          MOV
        </div>
      </div> */}
    </div>
  );
};
