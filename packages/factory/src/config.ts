export interface FactoryConfig {
  logInvalidRuns: boolean;
}

/** Central configuration for the Factory app, loaded from environment variables. */
export const factoryConfig: FactoryConfig = {
  logInvalidRuns: process.env.FACTORY_LOG_INVALID_RUNS === 'true',
};
