import { z } from "zod";
import type { Db } from "@/db";
import { fetchJson } from "../../http";

const API = "https://www.googleapis.com/youtube/v3";

const ChannelsResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string(), customUrl: z.string().optional() }),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }),
      }),
    )
    .default([]),
});

const PlaylistItemsResponse = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }) })).default([]),
});

const Thumbs = z.record(z.string(), z.object({ url: z.string() }));

export const VideoItem = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    description: z.string().default(""),
    channelId: z.string(),
    channelTitle: z.string().optional(),
    publishedAt: z.string(),
    liveBroadcastContent: z.string().optional(),
    thumbnails: Thumbs.optional(),
  }),
  contentDetails: z.object({ duration: z.string().optional() }).optional(),
  liveStreamingDetails: z
    .object({
      actualStartTime: z.string().optional(),
      actualEndTime: z.string().optional(),
      scheduledStartTime: z.string().optional(),
    })
    .optional(),
});
export type VideoItem = z.infer<typeof VideoItem>;

const VideosResponse = z.object({ items: z.array(VideoItem).default([]) });

export class YouTubeClient {
  constructor(
    private apiKey: string,
    private db?: Db,
  ) {}

  private async get(path: string, params: Record<string, string>) {
    const q = new URLSearchParams({ ...params, key: this.apiKey });
    return fetchJson(`${API}/${path}?${q}`, {
      source: "youtube",
      db: this.db,
      minIntervalMs: 100,
      redact: (url) => url.replace(/key=[^&]+/, "key=REDACTED"),
    });
  }

  async channels(params: { id: string } | { forHandle: string }) {
    return ChannelsResponse.parse(await this.get("channels", { part: "snippet,contentDetails", ...params })).items;
  }

  // 1 quota unit per call.
  async playlistVideoIds(playlistId: string, pageToken?: string) {
    const res = PlaylistItemsResponse.parse(
      await this.get("playlistItems", {
        part: "contentDetails",
        maxResults: "50",
        playlistId,
        ...(pageToken ? { pageToken } : {}),
      }),
    );
    return { ids: res.items.map((i) => i.contentDetails.videoId), next: res.nextPageToken };
  }

  // 1 quota unit per call of up to 50 IDs.
  async videos(ids: string[]): Promise<VideoItem[]> {
    const out: VideoItem[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = VideosResponse.parse(
        await this.get("videos", {
          part: "snippet,contentDetails,liveStreamingDetails",
          id: ids.slice(i, i + 50).join(","),
        }),
      );
      out.push(...res.items);
    }
    return out;
  }
}

export function parseVideosResponse(json: unknown): VideoItem[] {
  return VideosResponse.parse(json).items;
}
