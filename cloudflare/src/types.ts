/**
 * Bindings used by the existing JogjaTrip Worker.
 * Keep in sync with wrangler.jsonc. No new paid Cloudflare services required.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, any>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1Binding {
  prepare(query: string): D1PreparedStatement;
}
export interface WorkerEnv {
  DB: D1Binding;
  ASSETS: { fetch(request: Request): Promise<Response> };
  HOTEL_API_URL?: string;
  WISATA_API_URL?: string;
  TRANSPORT_API_URL?: string;
  HOTEL_PARTNER_TOKEN?: string;
  WISATA_PARTNER_TOKEN?: string;
  BOOKING_ENABLED?: string;
}
export type ProviderKind = 'hotel' | 'wisata' | 'transport';
export type ReservationStatus =
  | 'NOT_ATTEMPTED' | 'IN_FLIGHT' | 'CONFIRMED' | 'PENDING'
  | 'DECLINED' | 'CANCELLED' | 'FAILED' | 'UNKNOWN';
export interface Customer {
  name: string;
  email: string;
  phone?: string;
}
export type ServiceItem =
  | { type: 'hotel'; hotelId: string; roomId: string; checkIn: string; checkOut: string; guests: number }
  | { type: 'wisata'; destinationId: number; visitDate: string; quantity: number; tier: 'base' | 'plus' }
  | { type: 'transport'; vehicleId: string; startDate: string; endDate: string; withDriver: boolean };
