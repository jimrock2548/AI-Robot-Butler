# Jetson AI deployment

## Device inspection (2026-10-07)

- Device: Jetson Xavier NX 8GB, `192.168.1.200`, SSH user `nvidia`.
- OS: Ubuntu 20.04.6 LTS, aarch64, L4T R35.6.4.
- RAM reported by Linux: 6.7 GiB total, approximately 5.1 GiB available at inspection.
- Swap: 3.3 GiB. NVMe: 234 GB total, 178 GB available.
- CUDA Toolkit 11.4 is installed under `/usr/local/cuda-11.4`; `nvcc` is not initially in PATH.
- Build tools: git and g++ available; CMake installation required.

## Deployment workspace

Remote workspace: `/home/nvidia/hermes-ai` with `llama.cpp`, `models`, and `logs` directories.
The llama.cpp source was cloned at tag `b10545`, commit
`a30273376ef669023334fc20ad02ae4ed8196a65`, matching the build documented in
the existing PC experiment. GPU build compatibility with CUDA 11.4 still needs validation.

## Intended first validation

Run the existing Qwen3.5-2B Q5_K_M model as an API server on Jetson, then verify
Thai text responses, structured intent output, memory use, and response latency.
Backend/Admin/Kiosk migration and STT/TTS are separate remaining steps.
Robot motion remains disabled during initial AI validation.

## Paused for website / robot integration

The model download completed (approximately 1.5 GB). The build process group
`234853` was suspended with `SIGSTOP` at the user's request. No model server was
started. Resume only when the user returns to AI work; inspect the process group
before using `SIGCONT`, as PIDs may change after a reboot.

Do not store SSH passwords or API secrets in this document.
