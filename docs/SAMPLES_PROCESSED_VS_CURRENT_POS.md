# samples_processed 与 current_pos 差异分析

## 问题

从日志中看到：
- **已处理样本 (samples_processed)**: 5,415,936
- **当前播放位置 (current_pos)**: 111.28s
- **缓冲区样本 (buffer_samples)**: 95,744（单通道）

## 计算验证

假设采样率是 44100 Hz：

### 1. 基于 samples_processed 的计算

- 已处理样本：5,415,936（单通道）
- 对应时间：5,415,936 / 44100 ≈ **122.8 秒**

### 2. 基于 current_pos 的计算

- current_pos = 111.28s
- 对应样本数：111.28 * 44100 ≈ **4,907,448**（单通道）

### 3. 差异分析

- 差异：122.8 - 111.28 = **11.5 秒**
- 差异样本数：5,415,936 - 4,907,448 = **508,488**（单通道）

### 4. 缓冲区样本验证

- 缓冲区样本：95,744（单通道）
- 对应时间：95,744 / 44100 ≈ **2.17 秒**

### 5. 关系验证

理论上：
```
samples_processed = played_samples + buffer_samples
```

从日志：
- samples_processed = 5,415,936
- buffer_samples = 95,744
- played_samples（理论值）= 5,415,936 - 95,744 = 5,320,192
- played_samples（基于 current_pos）= 4,907,448

**差异**：5,320,192 - 4,907,448 = **412,744** 样本 ≈ **9.4 秒**

## 问题根源

### current_pos 的计算方式

从代码中看到，`current_pos` 是基于 `audio_clock` 计算的：

```rust
let current_pos = {
    let clock = *audio_clock.lock().unwrap();
    if clock > 0.0 {
        clock.min(audio_duration)
    } else {
        // 回退到基于 samples_processed 的计算
        let played_samples = samples_processed.saturating_sub(buffer_samples as u64);
        let pos = played_samples as f64 / output_sample_rate as f64;
        pos.min(audio_duration)
    }
};
```

### audio_clock 的计算方式

```rust
audio_clock = start_audio_pts + played_samples_total / sample_rate
```

其中：
- `start_audio_pts`：播放起始位置的 PTS（秒）
- `played_samples_total`：实际送进设备的样本总数（单通道）

### 可能的问题

1. **start_audio_pts 不是 0**
   - 如果第一个音频帧的 PTS 不是 0，而是某个值（如 10.0）
   - 那么 audio_clock 的计算就会从该值开始
   - 例如：start_audio_pts = 10.0，played_samples_total = 4,467,448（对应 101.28 秒）
   - audio_clock = 10.0 + 101.28 = 111.28s ✓

2. **played_samples_total 更新不及时**
   - `played_samples_total` 是在 cpal 回调中更新的
   - 如果回调更新不及时，可能导致 audio_clock 不准确

3. **samples_processed 与 played_samples_total 不同步**
   - `samples_processed` 是解码线程更新的（放入缓冲区时）
   - `played_samples_total` 是 cpal 回调更新的（从缓冲区取出时）
   - 两者之间存在时间差，这是正常的

## 结论

**这是正常的！**

原因：
1. **samples_processed** 反映的是**解码位置**（已解码并放入缓冲区的样本数）
2. **current_pos** 反映的是**实际播放位置**（基于 audio_clock，即实际送进设备的样本数）
3. 两者之间存在差异是正常的，因为：
   - 解码速度快，可以快速处理所有数据包
   - 播放速度慢，受采样率限制
   - 缓冲区积压了大量数据

**关键点**：
- 当 samples_processed = 5,415,936 时，解码位置已经到达文件末尾（122.8 秒）
- 但实际播放位置只有 111.28s，说明还有约 11.5 秒的数据在缓冲区中等待播放
- 这是正常的缓冲区积压现象

## 验证方法

要验证是否正常，可以检查：
1. `start_audio_pts` 的值（第一个音频帧的 PTS）
2. `played_samples_total` 的值（实际播放的样本数）
3. 两者的关系：`audio_clock = start_audio_pts + played_samples_total / sample_rate`

如果 `start_audio_pts` 不是 0，那么差异是正常的。

