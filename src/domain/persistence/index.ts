export type { PersistenceDiagnostic } from './diagnostics';
export {
  CAMPAIGN_SCHEMA_VERSION,
  LEGACY_DEFEAT_RECOVERY_HULL,
  V02_DEFEAT_REPAIR_COST_CREDITS,
  V02_STARTING_CREDITS,
  createNewGameCampaign,
} from './campaign-state';
export type {
  CampaignRunStatus,
  CampaignStateV1,
  MissionInProgressMarker,
  NewGameInput,
} from './campaign-state';
export {
  applyDefeatRecoveryOrGameOver,
  applyMissionSuccess,
  applySeamAbort,
  applySeamDefeat,
  beginMission,
  clearMissionInProgress,
} from './campaign-transitions';
export type {
  CampaignTransitionResult,
  DefeatRecoveryOutcome,
  DefeatRecoveryResult,
} from './campaign-transitions';
export {
  migrateCampaignRecord,
  migrateLegacyC03Campaign,
} from './campaign-schema';
export type {
  CampaignParseResult,
  CampaignSchemaContext,
  LegacyC03MigrationResult,
} from './campaign-schema';
export {
  DEFAULT_USER_SETTINGS,
  parseUserSettingsRecord,
} from './user-settings';
export type { UserSettingsParseResult, UserSettingsV1 } from './user-settings';
