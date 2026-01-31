import CompressorIcon from "@/assets/av-compressor.jpg";

export const CompressorLayer = () => {
  return (
    <div className="absolute bottom-0 left-4 right-4 h-40 translate-y-18 rounded-t-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 p-6 transition-transform duration-[250ms] group-hover:translate-y-10 group-hover:rotate-[1deg] group-hover:scale-105 flex items-center justify-center z-10">
      <img src={CompressorIcon} alt="av-compressor" className="absolute inset-0 w-full h-full object-cover rounded-t-2xl " />
    </div>
  );
};
