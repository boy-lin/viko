pub trait AudioPlaybackController: Send + Sync {
    type Command;

    fn command(&self, cmd: Self::Command) -> Result<(), String>;
    fn get_audio_clock(&self) -> f64;
    fn get_volume(&self) -> f32;
    fn set_volume(&self, volume: f32);
}

pub type DynAudioPlaybackController<C> = dyn AudioPlaybackController<Command = C>;
