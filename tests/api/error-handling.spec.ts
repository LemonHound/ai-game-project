import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8000/api";

async function loginTestUser(request: any) {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { email: "test@example.com", password: "password123" },
  });
  expect(res.ok()).toBeTruthy();
  return res;
}

test.describe("error-handling", () => {
  test("invalid_move_returns_board_state: 4xx for invalid move", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
      headers: { Cookie: cookies },
    });

    const moveRes = await request.post(`${BASE}/game/tic-tac-toe/move`, {
      data: { position: 999 },
      headers: { Cookie: cookies },
    });
    expect(moveRes.ok()).toBeFalsy();
    expect([400, 422]).toContain(moveRes.status());
    const body = await moveRes.json();
    expect(body).toHaveProperty("detail");
  });

  test("session_recovery_endpoint_returns_board: resume returns board state", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
      headers: { Cookie: cookies },
    });

    const resumeRes = await request.get(`${BASE}/game/tic-tac-toe/resume`, {
      headers: { Cookie: cookies },
    });
    expect(resumeRes.ok()).toBeTruthy();
    const body = await resumeRes.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("state");
    expect(body.state).not.toBeNull();
    expect(body.state.board).toHaveLength(9);
  });

  test("session_recovery_404_unknown_session: unknown session_id on events returns 404", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const res = await request.get(
      `${BASE}/game/tic-tac-toe/events/00000000-0000-0000-0000-000000000000`,
      { headers: { Cookie: cookies } }
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("detail");
  });

  test("unauth_game_start_rejected: unauthenticated newgame returns 401", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
    });
    expect(res.status()).toBe(401);
  });

  test("game_endpoints_consistent_error_shape: game errors have detail field", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const moveRes = await request.post(`${BASE}/game/tic-tac-toe/move`, {
      data: { position: -1 },
      headers: { Cookie: cookies },
    });
    expect(moveRes.ok()).toBeFalsy();
    const moveBody = await moveRes.json();
    expect(moveBody).toHaveProperty("detail");

    const unauthRes = await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
      headers: { Cookie: "" },
    });
    expect(unauthRes.status()).toBe(401);
    const unauthBody = await unauthRes.json();
    expect(unauthBody).toHaveProperty("detail");
  });
});
