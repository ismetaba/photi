import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "./client.js";

export interface MeResponse {
  user: {
    id: string;
    photiBalance: number;
    displayName?: string | null;
    createdAt: string;
  };
  balance: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
    eventId?: string | null;
    photoId?: string | null;
  }>;
}

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<MeResponse>("/me"),
    staleTime: 15_000,
  });
}

export interface EventListItem {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  status: "draft" | "live" | "archived";
  brandingColor: string;
  brandingLogoUrl?: string | null;
  coverImageUrl?: string | null;
  startsAt: string;
  endsAt: string;
}

export function useMyEvents() {
  return useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<EventListItem[]>("/events/mine"),
  });
}
