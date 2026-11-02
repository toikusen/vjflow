/// <reference lib="webworker" />
import { readAudio } from './free-audio';

addEventListener('message', ({ data }: MessageEvent<Float32Array>) => postMessage(readAudio(data)));
