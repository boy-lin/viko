use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DenoiseFilterConfig {
    pub remove_low: Option<bool>,
    pub remove_high: Option<bool>,
    pub fft_denoise: Option<bool>,
    pub noise_gate: Option<bool>,
    pub low_cutoff_hz: Option<f32>,
    pub high_cutoff_hz: Option<f32>,
    pub fft_nr: Option<f32>,
    pub fft_nf: Option<f32>,
    pub gate_threshold: Option<f32>,
    pub gate_ratio: Option<f32>,
    pub gate_attack_ms: Option<f32>,
    pub gate_release_ms: Option<f32>,
}

impl Default for DenoiseFilterConfig {
    fn default() -> Self {
        Self {
            remove_low: Some(true),
            remove_high: Some(true),
            fft_denoise: Some(true),
            noise_gate: Some(true),
            low_cutoff_hz: Some(120.0),
            high_cutoff_hz: Some(8000.0),
            fft_nr: Some(12.0),
            fft_nf: Some(-25.0),
            gate_threshold: Some(0.015),
            gate_ratio: Some(2.5),
            gate_attack_ms: Some(20.0),
            gate_release_ms: Some(250.0),
        }
    }
}

pub fn build_audio_filter_spec(config: Option<&DenoiseFilterConfig>) -> String {
    let cfg = config.cloned().unwrap_or_default();
    let mut filters: Vec<String> = Vec::new();

    if cfg.remove_low.unwrap_or(true) {
        let cutoff = cfg.low_cutoff_hz.unwrap_or(120.0).clamp(20.0, 500.0);
        filters.push(format!("highpass=f={}", cutoff.round()));
    }

    if cfg.remove_high.unwrap_or(true) {
        let cutoff = cfg.high_cutoff_hz.unwrap_or(8000.0).clamp(1000.0, 20000.0);
        filters.push(format!("lowpass=f={}", cutoff.round()));
    }

    if cfg.fft_denoise.unwrap_or(true) {
        let nr = cfg.fft_nr.unwrap_or(12.0).clamp(1.0, 30.0);
        let nf = cfg.fft_nf.unwrap_or(-25.0).clamp(-80.0, -5.0);
        filters.push(format!("afftdn=nr={nr:.2}:nf={nf:.2}:tn=1"));
    }

    if cfg.noise_gate.unwrap_or(true) {
        let threshold = cfg.gate_threshold.unwrap_or(0.015).clamp(0.0001, 1.0);
        let ratio = cfg.gate_ratio.unwrap_or(2.5).clamp(1.0, 20.0);
        let attack = cfg.gate_attack_ms.unwrap_or(20.0).clamp(1.0, 1000.0);
        let release = cfg.gate_release_ms.unwrap_or(250.0).clamp(1.0, 5000.0);
        filters.push(format!(
            "agate=threshold={threshold:.4}:ratio={ratio:.2}:attack={attack:.1}:release={release:.1}"
        ));
    }

    if filters.is_empty() {
        "anull".to_string()
    } else {
        filters.join(",")
    }
}
