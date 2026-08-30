import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { DEFAULT_USER_SETTINGS, V02_STARTING_CREDITS } from '@domain/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { PersistenceCommandDeps } from './commands';
import {
  buildNewGameCampaign,
  createNewGameCommand,
  readHydrationSettings,
  setMouseMovementEnabled,
} from './commands';

describe('buildNewGameCampaign', () => {
  it('builds the canonical v0.2 New Game state from the validated content', () => {
    const campaign = buildNewGameCampaign(CONTENT_CATALOGUE, 3735928559);
    expect(campaign.schemaVersion).toBe(1);
    expect(campaign.runStatus).toBe('active');
    expect(campaign.credits).toBe(V02_STARTING_CREDITS);
    expect(campaign.hullIntegrity).toBe(100);
    expect(campaign.equippedWeapon).toBe('machine-gun');
    expect(campaign.unlockedMissionIds).toEqual(['interception-01']);
    expect(campaign.missionInProgress).toBeNull();
  });
});

describe('setMouseMovementEnabled (Epic §14.1, V02-AC-017)', () => {
  it('persists the Settings change before updating the session', async () => {
    const app = createInitializedTestApplication();
    await setMouseMovementEnabled(
      { store: app.store, userSettingsStore: app.userSettingsStore },
      false,
    );
    expect(app.userSettingsStore.current).toEqual({
      mouseMovementEnabled: false,
    });
    expect(app.store.getState()?.mouseMovementEnabled).toBe(false);
  });
});

describe('confirmNewGame (Epic §13.6, V02-AC-017)', () => {
  it('atomically replaces the campaign, keeps Settings, and resets the session', async () => {
    const app = createInitializedTestApplication();
    // Damage the run and persist a distinct Settings value.
    await setMouseMovementEnabled(
      { store: app.store, userSettingsStore: app.userSettingsStore },
      false,
    );
    const damaged = {
      ...app.campaignStore.current!,
      credits: 3,
      hullIntegrity: 20,
    };
    await app.campaignStore.replace(damaged);

    const command = createNewGameCommand({
      store: app.store,
      campaignStore: app.campaignStore,
      userSettingsStore: app.userSettingsStore,
      content: CONTENT_CATALOGUE,
    });
    await command.run(123456789);

    // Campaign replaced with the fresh New Game state.
    const campaign = app.campaignStore.current!;
    expect(campaign.credits).toBe(V02_STARTING_CREDITS);
    expect(campaign.hullIntegrity).toBe(100);
    expect(campaign.runStatus).toBe('active');
    expect(campaign.missionInProgress).toBeNull();
    expect(campaign.unlockedMissionIds).toEqual(['interception-01']);
    // A new seed draws a new Pilot with equal probability.
    expect(campaign.pilotId).not.toBe(damaged.pilotId);
    // Session reset mirrors the fresh campaign while Settings are preserved.
    const session = app.store.getState()!;
    expect(session.credits).toBe(V02_STARTING_CREDITS);
    expect(session.hullIntegrity).toBe(100);
    expect(session.runStatus).toBe('active');
    expect(session.currentScreen).toBe('operations');
    expect(session.activeMission).toBe('none');
    expect(session.mouseMovementEnabled).toBe(false);
    expect(app.userSettingsStore.current).toEqual({
      mouseMovementEnabled: false,
    });
  });

  it('uses the approved default Settings when none are persisted', async () => {
    const app = createInitializedTestApplication();
    const command = createNewGameCommand({
      store: app.store,
      campaignStore: app.campaignStore,
      userSettingsStore: app.userSettingsStore,
      content: CONTENT_CATALOGUE,
    });
    await command.run(123456789);
    expect(app.store.getState()?.mouseMovementEnabled).toBe(
      DEFAULT_USER_SETTINGS.mouseMovementEnabled,
    );
  });

  it('is single-flight at the composition-root command boundary: concurrent confirmed callbacks create exactly one run and Pilot', async () => {
    const app = createInitializedTestApplication();
    await setMouseMovementEnabled(
      { store: app.store, userSettingsStore: app.userSettingsStore },
      false,
    );
    const deps: PersistenceCommandDeps = {
      store: app.store,
      campaignStore: app.campaignStore,
      userSettingsStore: app.userSettingsStore,
      content: CONTENT_CATALOGUE,
    };
    const command = createNewGameCommand(deps);
    // Two concurrent activations of one logical confirmed action on ONE
    // composition-root instance must coalesce into one execution.
    const first = command.run(3735928559);
    const second = command.run(123456789);
    await Promise.all([first, second]);

    // Exactly one durable replacement: the first invocation's seed won the
    // single flight, so a second Pilot/run was never created.
    const campaign = app.campaignStore.current!;
    expect(campaign.credits).toBe(V02_STARTING_CREDITS);
    expect(campaign.runStatus).toBe('active');
    expect(campaign.pilotId).toBe(
      buildNewGameCampaign(CONTENT_CATALOGUE, 3735928559).pilotId,
    );
    expect(campaign.pilotId).not.toBe(
      buildNewGameCampaign(CONTENT_CATALOGUE, 123456789).pilotId,
    );
    const session = app.store.getState()!;
    expect(session.pilot.id).toBe(campaign.pilotId);
    expect(session.credits).toBe(V02_STARTING_CREDITS);
    // Settings remain unchanged.
    expect(app.userSettingsStore.current).toEqual({
      mouseMovementEnabled: false,
    });

    // The latch clears on completion, so a later, genuinely separate confirmed
    // New Game on the SAME instance still works.
    await command.run(424242424);
    expect(app.campaignStore.current!.pilotId).toBe(
      buildNewGameCampaign(CONTENT_CATALOGUE, 424242424).pilotId,
    );
  });

  it('scopes the single-flight latch to the active application instance: independent instances never suppress each other', async () => {
    const appA = createInitializedTestApplication();
    const appB = createInitializedTestApplication();
    const commandA = createNewGameCommand({
      store: appA.store,
      campaignStore: appA.campaignStore,
      userSettingsStore: appA.userSettingsStore,
      content: CONTENT_CATALOGUE,
    });
    const commandB = createNewGameCommand({
      store: appB.store,
      campaignStore: appB.campaignStore,
      userSettingsStore: appB.userSettingsStore,
      content: CONTENT_CATALOGUE,
    });

    // Each application instance owns its own latch and replaces ITS OWN
    // campaign; the concurrent calls never share or suppress each other.
    await Promise.all([commandA.run(3735928559), commandB.run(123456789)]);

    expect(appA.campaignStore.current!.pilotId).toBe(
      buildNewGameCampaign(CONTENT_CATALOGUE, 3735928559).pilotId,
    );
    expect(appB.campaignStore.current!.pilotId).toBe(
      buildNewGameCampaign(CONTENT_CATALOGUE, 123456789).pilotId,
    );
    expect(appA.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(appB.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
  });

  it('does not overwrite an invalid persisted Settings record during Boot hydration', async () => {
    const app = createInitializedTestApplication();
    const invalid = { mouseMovementEnabled: 'not-a-boolean' } as unknown;
    // The in-memory fake validates on read; seed the invalid record directly.
    await app.userSettingsStore.write(
      invalid as { mouseMovementEnabled: boolean },
    );
    const settings = await readHydrationSettings({
      userSettingsStore: app.userSettingsStore,
    });
    // The approved in-memory default is used and the record is NOT overwritten.
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(app.userSettingsStore.current).toEqual(invalid);
  });
});
