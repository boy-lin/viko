进度上报：未统一事件命名/节流逻辑（音频/视频各模块仍用原有实现），未抽到 media_common。                           
  - video_converter.rs 多轨音频：基本转码接入，但未实现按轨道复制/跳过的细粒度策略（目前只转码配置的轨道，未暴露      
    stream copy 选项）；也未应用质量选项到不同编码器（仅简单 q:a），未支持硬件音频编码。                              
  - 视频端高级参数：rc_mode/min/max bitrate/pixel format 深度、硬件加速更丰富映射、裁剪/滤镜链尚未实现；              
    video_compressor.rs 仍未做滤镜/帧率/像素格式等抽象。

目前尚未实现 palettegen/paletteuse 滤镜链（仍然用 RGB8 直接送编码器），因此透明与调色板优化未生效；要按“fps,scale ->
  palettegen -> paletteuse=alpha=1”方案，需要在 GIF 转码中构建滤镜图（buffer→scale/fps→split→palettegen/              
  paletteuse→buffersink），让输出帧为 pal8 再送 GIF 编码器。                                                          
  工作量较大（涉及 filter::Graph 构建、buffer args、sink 像素格式、按帧推送/拉取），目前尚未动手，以免引入新的崩溃。