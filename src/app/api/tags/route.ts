import { makeSuggestTagsController } from "@/models/events/infra/factories/make-suggest-tags-controller";

export async function GET(request: Request): Promise<Response> {
  return makeSuggestTagsController().handle(request);
}
