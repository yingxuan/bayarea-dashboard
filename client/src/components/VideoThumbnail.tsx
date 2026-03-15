import { useMemo, useState } from "react";

const FALLBACK_POSTER =
  "https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=1200&h=900&fit=crop";

function extractVideoId(url?: string) {
  if (!url) return null;

  const watchMatch = /[?&]v=([^&]+)/.exec(url);
  if (watchMatch?.[1]) return watchMatch[1];

  const shortMatch = /youtu\.be\/([^?&/]+)/.exec(url);
  if (shortMatch?.[1]) return shortMatch[1];

  const shortsMatch = /\/shorts\/([^?&/]+)/.exec(url);
  if (shortsMatch?.[1]) return shortsMatch[1];

  return null;
}

function buildCandidates(src?: string, videoUrl?: string, videoId?: string) {
  const resolvedId = videoId || extractVideoId(videoUrl);
  const candidates = [src].filter(Boolean) as string[];

  if (resolvedId) {
    candidates.push(`https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`);
    candidates.push(`https://i.ytimg.com/vi/${resolvedId}/mqdefault.jpg`);
    candidates.push(`https://i.ytimg.com/vi/${resolvedId}/default.jpg`);
  }

  candidates.push(FALLBACK_POSTER);

  return Array.from(new Set(candidates));
}

type Props = {
  src?: string;
  alt: string;
  className?: string;
  videoUrl?: string;
  videoId?: string;
};

export default function VideoThumbnail({ src, alt, className, videoUrl, videoId }: Props) {
  const candidates = useMemo(() => buildCandidates(src, videoUrl, videoId), [src, videoUrl, videoId]);
  const [index, setIndex] = useState(0);

  return (
    <img
      src={candidates[index]}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        setIndex((current) => (current < candidates.length - 1 ? current + 1 : current));
      }}
    />
  );
}
