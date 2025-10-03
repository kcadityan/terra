Kernel Prompt: Mining Game Architecture (In-Proc, Modular, UI-Agnostic)

You are to design and generate code for a mining game with an in-process kernel (tiny TCB), a standardized module system (server + client sides), a frontend-agnostic client via a SceneAPI abstraction, and an append-only, replayable WorldLog for determinism and auditability.

Core Principles

Tiny Kernel / TCB

Kernel owns authoritative state (grid, players, inventory, balances).

Exposes a small, versioned syscall surface; all changes go through it.

Capabilities, not globals

Mods receive only capability functions; no direct imports of kernel state.

Message-passing mindset (even in-proc)

Requests/responses validated by schema; errors are controlled outcomes.

Data-oriented core

Dense IDs, SoA/typed arrays; compile tool × material → Rule tables for O(1) hot loops.

No dynamic dispatch inside hot loops.

Extensibility via registration

Server mods: registerMaterial, registerKind, registerStrikeRule.

Client mods: registerRenderer(kindId, loader).

Determinism

Fixed-tick sim; kernel-seeded RNG only; no wall clock in server code.

Supervision & Safety

Timeouts and error capture around mod init/hooks.

Invariants: counts ≥ 0; materials ∈ registry; actions are total.

Versioning

ABI for syscalls and client SceneAPI is versioned and stable.

Frontend-agnostic rendering

Client renderers talk to a tiny SceneAPI façade.

Concrete adapters implement SceneAPI for Phaser, Babylon, Pixi, etc.

Swapping engines = swap adapter; mods stay unchanged.

WorldLog (event sourcing)

Append-only log of DomainEvents (e.g. BlockRemoved, ItemGranted, PlayerMoved).

Belongs to the kernel layer (not mods).

Interface:

export interface WorldLog {
  getState(): WorldState;                          // current state
  append(events: ReadonlyArray<DomainEvent>): Promise<void>; 
  replay(): Promise<WorldState>;                   // rebuild deterministically
}


Mods never write to the log.

Mods only propose rules → kernel turns them into DomainEvents, applies them, and appends them.

Supports determinism, recovery, audit trail, replay, branching.

Repository Layout
/engine/
  /kernel/            # SoA state, rule tables, syscalls, WorldLog
  /shared/            # SDK types: ServerAPI, ClientAPI, SceneAPI, specs
  /client/            # runtime + SceneAPI adapters (phaser, babylon)
/mods/
  /<module-name>/
    mod.json
    server/
      index.ts        # init(api: ServerAPI)
    client/
      index.ts        # initClient(api: ClientAPI)
      renderers/
        <kind>.renderer.ts
      assets/
    tests/
      mod.spec.ts


Server SDK (authoritative)

Specs & IDs

MaterialSpec { id, displayName, category, hardness, drop? }

KindSpec { id, server:{components, hooks?}, client? }

StrikeRule { tool, material, outcome } with StrikeOutcome = NoOp | Error | Removed(+drops)

Syscalls

registerMaterial(spec)

registerKind(spec)

registerStrikeRule(rule)

(Kernel compiles rules into tables; validates invariants)

WorldLog

Kernel appends validated DomainEvents after applying.

Kernel state can be rebuilt by replay.

Client SDK (UI-agnostic)

SceneAPI (frontend-neutral façade)

export interface SceneAPI {
  loadImage(key: string, url: string): Promise<void>;
  loadGLB?(url: string): Promise<any>;
  createSprite(x: number, y: number, key: string): any;
  createModel?(url: string): Promise<any>;

  bindEntity(eid: number, handle: any): void;
  getBound<T = any>(eid: number): T | undefined;
  unbindEntity(eid: number): void;

  setPosition(handle: any, x: number, y: number): void;
  setRotation(handle: any, rot: number): void;
  playAnim(handle: any, name: string): void;

  remove(handle: any): void;
}

ClientAPI

registerRenderer(kindId: string, loader: () => Promise<ClientRenderer>)

ClientRenderer

mount(eid, scene: SceneAPI)

update(eid, scene: SceneAPI, interp: {x,y,rot?,speed?})

unmount(eid, scene: SceneAPI)

Adapters

Example: PhaserSceneAPI, BabylonSceneAPI implement SceneAPI.

Kernel runtime chooses adapter; mods stay unchanged.

Module Contribution Standard
mod.json

{ "id": "user.miner", "version": "1.0.0", "apiVersion": 1,
  "serverEntry": "./server/index.ts", "clientEntry": "./client/index.ts" }



server/index.ts

Registers materials, kinds, and rules:
export function init(api: ServerAPI) {
  api.registerMaterial({
    id: "user.miner.gold_ore",
    displayName: "Gold Ore",
    category: "solid",
    hardness: 5,
    drop: { kind: "item", id: "core.gold_nugget", amount: 1 }
  });

  api.registerKind({
    id: "user.miner.human",
    server: {
      components: {
        Transform: { x:0, y:0, rot:0 },
        RigidBody: { mass:80, maxSpeed:6, accel:40, drag:6 },
        Controller:{ type:"biped_run_jump" },
        Inventory:{ slots:20 }
      }
    },
    client: {
      loadRenderer: async () =>
        (await import("../client/renderers/human.renderer")).renderer
    }
  });

  api.registerStrikeRule({
    tool: "pickaxe",
    material: "user.miner.gold_ore",
    outcome: { kind: "Removed", drops: [{ id:"core.gold_nugget", qty:1 }] }
  });
}




client/index.ts
export function initClient(api: ClientAPI) {
  api.registerRenderer("user.miner.human", async () => {
    const { renderer } = await import("./renderers/human.renderer");
    return renderer;
  });
}

client/renderers/human.renderer.ts



export const renderer: ClientRenderer = {
  async mount(eid, scene) {
    if (scene.createModel) {
      const model = await scene.createModel("mods/user.miner/assets/human.glb");
      scene.bindEntity(eid, model);
      scene.playAnim(model, "idle");
    } else {
      await scene.loadImage("human", "mods/user.miner/assets/human.png");
      const spr = scene.createSprite(0, 0, "human");
      scene.bindEntity(eid, spr);
      scene.playAnim(spr, "idle");
    }
  },
  update(eid, scene, interp) {
    const h = scene.getBound(eid); if (!h) return;
    scene.setPosition(h, interp.x, interp.y);
    if (interp.rot != null) scene.setRotation(h, interp.rot);
    scene.playAnim(h, (interp.speed ?? 0) > 0.1 ? "run" : "idle");
  },
  unmount(eid, scene) {
    const h = scene.getBound(eid); if (h) { scene.remove(h); scene.unbindEntity(eid); }
  }
};


Example Flow: Mining Gold

Module registers gold_ore, human kind, and pickaxe × gold_ore rule.

Kernel compiles rules into the rule table.

Player “p1” strikes a gold ore block.

Kernel generates events:

{type:"BlockRemoved", at:{x,y}, old:"gold_ore"}

{type:"ItemGranted", player:"p1", item:"gold_nugget", qty:1}

Kernel applies them to state, updates world.

Kernel appends them to WorldLog.

Client sees updated state, renderer shows block removed and nugget in inventory.

On restart, kernel can replay the WorldLog to reconstruct world state.

Contributor Checklist

 mod.json with id, version, entries.

 server/index.ts: register materials, kinds, strike rules.

 client/index.ts: register renderers.

 renderers/*.ts: implement mount/update/unmount with SceneAPI.

 Assets in client/assets/.

 Tests in tests/.

 Namespaced IDs.

 No randomness/time in server logic.

What to Generate

Kernel (TS): SoA state, syscalls, WorldLog.

Shared SDK: ServerAPI, ClientAPI, SceneAPI, specs, DomainEvents.

Client runtime: loads SceneAPI adapter + renderers.

Example adapters: Phaser, Babylon.

Example module: “Miner & Gold.”

Tests: property/decision checks, replay tests for WorldLog.

Clear comments marking kernel vs module boundaries.

