import { useEffect, useRef, useState } from "react";
import { playbackEngine } from "@/services/playback/engine";

/** Re-renders the calling component on every playhead update. */
export function usePlayheadTime(): number {
  const [time, setTime] = useState(playbackEngine.time);
  useEffect(() => playbackEngine.subscribe((t) => setTime(t)), []);
  return time;
}

export function usePlaybackState(): { playing: boolean; time: number } {
  const [state, setState] = useState({ playing: playbackEngine.playing, time: playbackEngine.time });
  useEffect(
    () =>
      playbackEngine.subscribe((time, playing) =>
        setState((prev) => (prev.playing === playing ? { ...prev, time } : { time, playing })),
      ),
    [],
  );
  return state;
}

export function usePlaybackPlaying(): boolean {
  const [playing, setPlaying] = useState(playbackEngine.playing);
  useEffect(
    () => playbackEngine.subscribe((_time, nextPlaying) => {
      setPlaying((current) => (current === nextPlaying ? current : nextPlaying));
    }),
    [],
  );
  return playing;
}

/** Subscription without re-render — the callback runs inside the rAF loop. */
export function usePlayheadRef(cb: (time: number, playing: boolean) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => playbackEngine.subscribe((t, p) => ref.current(t, p)), []);
}
