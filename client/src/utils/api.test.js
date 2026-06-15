import assert from 'node:assert/strict';
import test from 'node:test';
import { bookApi } from './api.js';

function mockFetch(response) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function coverFile() {
  return new Blob(['cover'], { type: 'image/png' });
}

test('uploadCover rejects with server error message when upload fails', async () => {
  const restoreFetch = mockFetch(jsonResponse(500, { error: '封面处理失败' }));
  try {
    await assert.rejects(
      bookApi.uploadCover('book-1', coverFile()),
      /封面处理失败/,
    );
  } finally {
    restoreFetch();
  }
});

test('uploadCover rejects and redirects authRequired responses like request', async () => {
  const restoreFetch = mockFetch(jsonResponse(401, { authRequired: true, error: '请先登录' }));
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const assignedUrls = [];

  globalThis.window = {
    location: {
      assign(url) {
        assignedUrls.push(url);
      },
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        async getRegistrations() {
          return [{ unregister: async () => true }];
        },
      },
    },
  });

  try {
    await assert.rejects(
      bookApi.uploadCover('book-1', coverFile()),
      /请先登录|HTTP 401/,
    );
    assert.deepEqual(assignedUrls, ['/']);
  } finally {
    restoreFetch();
    globalThis.window = originalWindow;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  }
});
