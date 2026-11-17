import { Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import type { PlaceSuggestionDto } from "@repo/contracts";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import {
  PLACE_SEARCH_GATEWAY,
  PhotonPlaceSearchGateway,
  type PlaceSearchGateway,
} from "../../infrastructure/places/photon-place-search.gateway";
import { SearchPlacesUseCase } from "./search-places.usecase";

@Controller("api/places")
export class SearchPlacesController {
  constructor(@Inject(SearchPlacesUseCase) private readonly searchPlaces: SearchPlacesUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(
    @Query("query") query?: string,
    @Query("limit") limit?: string,
  ): Promise<PlaceSuggestionDto[]> {
    const requestedLimit = Number(limit);
    return this.searchPlaces.execute({
      query: query ?? "",
      limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
    });
  }
}

@Module({
  controllers: [SearchPlacesController],
  providers: [
    { provide: PLACE_SEARCH_GATEWAY, useFactory: () => new PhotonPlaceSearchGateway() },
    {
      provide: SearchPlacesUseCase,
      inject: [PLACE_SEARCH_GATEWAY],
      useFactory: (places: PlaceSearchGateway) => new SearchPlacesUseCase(places),
    },
  ],
})
export class SearchPlacesModule {}
