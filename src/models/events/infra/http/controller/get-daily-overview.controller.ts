import { GetDailyOverviewUseCase } from "../../../application/usecases/get-daily-overview.usecase";

export class GetDailyOverviewController {
  constructor(private readonly useCase: GetDailyOverviewUseCase) {}

  async handle(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const date = query.get("date");
    if (!date) return Response.json({ error: "date is required" }, { status: 400 });

    const overview = await this.useCase.execute({
      date,
    });
    return Response.json(overview);
  }
}
