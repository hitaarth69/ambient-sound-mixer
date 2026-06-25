# 🌿 Ambient Sound Mixer

A real-time ambient soundscape generator built with the Web Audio API. Mix rain, ocean waves, a crackling fireplace, and a cozy coffee shop to create your perfect focus or relaxation environment.

## 🚀 Live Demo
[Click here to try it live!](https://your-username.github.io/ambient-sound-mixer)

## ✨ Features
- **Four unique sound layers** – Rain, Ocean, Fireplace, Coffee Shop.
- **Independent volume sliders** – Mix each sound to your preference.
- **Master volume control** – Global level for all sounds.
- **Real-time visualizer** – Frequency spectrum analyzer showing the audio output.
- **Glass-morphism UI** – Soothing dark theme with smooth animations.
- **Zero external audio files** – All sounds are synthesized in-browser using the Web Audio API (no downloads, fully self-contained).

## 🛠️ How It Works (Technical)
- **White Noise** – Generated using `Math.random()` in an `AudioBuffer` for rain.
- **Pink Noise** – Filtered white noise with a -3dB/octave rolloff for ocean waves.
- **Brown Noise** – Filtered white noise with a -6dB/octave rolloff for fireplace rumble.
- **Coffee Shop** – Bandpassed noise with a feedback delay (echo) to simulate room ambiance.
- **Visualizer** – An `AnalyserNode` captures frequency data and renders real-time bars on a `<canvas>`.

## 🏃 How to Run Locally
1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/ambient-sound-mixer.git
