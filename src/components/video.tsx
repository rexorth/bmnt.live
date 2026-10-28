import { formatOffset, formatDuration } from "@/lib/time";
import { embedUrl, watchUrl } from "@/lib/youtube-url";

export function VideoEmbed({ youtubeId, start, title }: { youtubeId: string; start?: number | null; title: string }) {
  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-line bg-black">
      <iframe
        src={embedUrl(youtubeId, start)}
        title={title}
        className="size-full"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  live: "Live now",
  upcoming: "Upcoming stream",
  vod: "Full video",
  highlight: "Highlights",
};

export function VideoLink({
  v,
  start,
  label,
}: {
  v: {
    youtubeId: string;
    title: string | null;
    channelTitle: string | null;
    kind: string;
    durationSec: number | null;
    thumbnailUrl: string | null;
  };
  start?: number | null;
  label?: string;
}) {
  return (
    <a
      href={watchUrl(v.youtubeId, start)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-lg border border-line bg-surface p-2 hover:border-accent"
    >
      {v.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails, already sized by YouTube
        <img
          src={v.thumbnailUrl}
          alt=""
          width={120}
          height={68}
          className="h-[68px] w-[120px] shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-[68px] w-[120px] shrink-0 items-center justify-center rounded bg-surface-2 text-xl text-muted">
          ▶
        </span>
      )}
      <span className="min-w-0 text-sm">
        <span className="line-clamp-2 font-medium">{v.title ?? "YouTube video"}</span>
        <span className="mt-1 block text-xs text-muted">
          {[
            label ?? KIND_LABEL[v.kind],
            v.channelTitle,
            v.durationSec ? formatDuration(Math.round(v.durationSec / 60)) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {start ? <span className="text-accent"> · starts at {formatOffset(start)}</span> : null}
        </span>
      </span>
    </a>
  );
}
