import { Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import type { GeoPointInput, PlaceSuggestionDto } from "@repo/contracts";
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
    @Query("lat") lat?: string,
    @Query("lon") lon?: string,
  ): Promise<PlaceSuggestionDto[]> {
    const requestedLimit = Number(limit);
    return this.searchPlaces.execute({
      query: query ?? "",
      limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
      near: nearPoint(lat, lon),
    });
  }
}

/** Onde a pessoa esta, se veio inteiro e dentro do globo. Coordenada torta nao e erro: a busca segue sem ela. */
export function nearPoint(lat?: string, lon?: string): GeoPointInput | undefined {
  if (!lat?.trim() || !lon?.trim()) return undefined;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude };
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
