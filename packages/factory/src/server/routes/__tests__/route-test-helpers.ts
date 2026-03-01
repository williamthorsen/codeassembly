import type { Router } from 'express';
import { vi } from 'vitest';

import type { ProjectIndex, ProjectIndexProvider } from '../../../shared/types/api.js';

// --- Mock response ---

export interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): void;
}

export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
  };
  return res;
}

// --- Mock scanner ---

export function createMockScanner(index: ProjectIndex | null): ProjectIndexProvider {
  return { getIndex: vi.fn(() => index) };
}

// --- Handler extraction ---

export type RouteHandler = (
  req: { params: Record<string, string>; body?: unknown },
  res: MockResponse,
) => void | Promise<void>;

function prop(obj: unknown, key: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object' && typeof obj !== 'function') return undefined;
  return Object.getOwnPropertyDescriptor(obj, key)?.value;
}

function isMatchingRoute(route: unknown, method: string, path: string): boolean {
  if (typeof route !== 'object' || route === null) return false;

  const routePath = prop(route, 'path');
  if (routePath !== path) return false;

  const methods = prop(route, 'methods');
  if (typeof methods !== 'object' || methods === null) return false;
  return Object.prototype.hasOwnProperty.call(methods, method.toLowerCase());
}

interface HasHandle {
  handle(...args: Array<unknown>): unknown;
}

function hasHandle(obj: unknown): obj is HasHandle {
  return typeof obj === 'object' && obj !== null && 'handle' in obj && typeof obj.handle === 'function';
}

function extractLayerWithHandle(route: unknown): HasHandle | undefined {
  const routeStack = prop(route, 'stack');
  if (!Array.isArray(routeStack) || routeStack.length === 0) return undefined;
  if (hasHandle(routeStack[0])) return routeStack[0];
  return undefined;
}

/**
 * Invokes a route layer's handle function and awaits the result if it returns a Promise.
 */
async function invokeLayerHandle(
  layer: HasHandle,
  req: { params: Record<string, string>; body?: unknown },
  res: MockResponse,
): Promise<void> {
  const result: unknown = layer.handle(req, res);
  if (result instanceof Promise) await result;
}

function createRouteHandler(layer: HasHandle): RouteHandler {
  return (req, res) => invokeLayerHandle(layer, req, res);
}

/**
 * Extracts a route handler from an Express Router by method and path.
 *
 * Express Router stores registered routes in an internal `.stack` array of layers.
 * This function navigates that structure using runtime property access with type narrowing.
 */
export function getHandler(router: Router, method: string, path: string): RouteHandler {
  const stack = prop(router, 'stack');
  if (!Array.isArray(stack)) throw new Error('Router has no stack');

  for (const layer of stack) {
    const route = prop(layer, 'route');
    if (!isMatchingRoute(route, method, path)) continue;

    const routeLayer = extractLayerWithHandle(route);
    if (!routeLayer) continue;

    return createRouteHandler(routeLayer);
  }

  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}
