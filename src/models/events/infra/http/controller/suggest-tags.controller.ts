import { SuggestTagsUseCase } from "../../../application/usecases/suggest-tags.usecase";

export class SuggestTagsController {
  constructor(private readonly useCase: SuggestTagsUseCase) {}

  async handle(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const requestedLimit = Number(query.get("limit"));
    const tags = await this.useCase.execute({
      query: query.get("query") ?? "",
      limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
    });
    return Response.json(tags);
  }
}
