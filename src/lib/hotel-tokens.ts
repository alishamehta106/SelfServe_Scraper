import type { Hotel } from "@prisma/client";

export function isReviewToken(hotel: Hotel, token: string): boolean {
  return hotel.reviewToken === token;
}

export function isOperatorToken(hotel: Hotel, token: string): boolean {
  return Boolean(hotel.operatorToken) && hotel.operatorToken === token;
}

export function isAnyAccessToken(hotel: Hotel, token: string): boolean {
  return isReviewToken(hotel, token) || isOperatorToken(hotel, token);
}
