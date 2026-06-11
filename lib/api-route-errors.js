import { NextResponse } from 'next/server';

export const toRouteErrorResponse = (error, fallbackMessage = 'Une erreur est survenue.') =>
  NextResponse.json(
    {
      error: error?.message || fallbackMessage,
    },
    {
      status: Number.isInteger(error?.statusCode) ? error.statusCode : 500,
    }
  );
