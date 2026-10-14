// The physical K01 emits PageUp / PageDown as confirmed by Windows event logs.
// The notebook arrows also remain usable. During the intro video,
// they seek within the MP4 rather than advancing the PowerPoint presentation.
export const INTRO_SEEK_STEP_SECONDS = 5;

export function introSeekDirection(event) {
  if (!event || event.type !== 'keydown' || event.repeat ||
      event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return 0;
  if (event.code === 'ArrowLeft' || event.code === 'ArrowUp' || event.code === 'PageUp') return -1;
  if (event.code === 'ArrowRight' || event.code === 'ArrowDown' || event.code === 'PageDown') return 1;
  return 0;
}

export function seekIntroVideo(video, direction, seconds=INTRO_SEEK_STEP_SECONDS) {
  if (!video || (direction !== 1 && direction !== -1)) return null;
  const current=Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const end=Number.isFinite(video.duration) ? Math.max(0,video.duration) : Infinity;
  const target=Math.min(end,Math.max(0,current + direction * seconds));
  try {
    video.currentTime=target;
    return target;
  } catch {
    // Metadata still loading or the browser temporarily rejects a seek.
    // Keep the video open and preserve slide navigation isolation.
    return null;
  }
}
