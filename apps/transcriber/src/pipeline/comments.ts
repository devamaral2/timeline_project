import type { TranscriptionComment } from "@repo/contracts";
import type { RawComment } from "../types";

export const MAX_COMMENTS = 50;

/**
 * Os 50 comentários de primeiro nível mais recentes. Quem não tem data fica onde o yt-dlp o pôs (ele já pede os
 * mais novos primeiro) e leva a hora da coleta como data, porque o contrato exige uma.
 */
export function latestComments(raw: RawComment[], now: Date): TranscriptionComment[] {
  return raw
    .filter((comment) => !comment.isReply && comment.text.trim().length > 0)
    .map((comment, order) => ({ comment, order }))
    .sort((a, b) => {
      if (a.comment.timestamp !== null && b.comment.timestamp !== null && a.comment.timestamp !== b.comment.timestamp) {
        return b.comment.timestamp - a.comment.timestamp;
      }
      return a.order - b.order;
    })
    .slice(0, MAX_COMMENTS)
    .map(({ comment }) => ({
      author: comment.author,
      text: comment.text.trim(),
      likes: Math.max(0, Math.floor(comment.likes)),
      publishedAt: (comment.timestamp === null ? now : new Date(comment.timestamp * 1000)).toISOString(),
    }));
}
