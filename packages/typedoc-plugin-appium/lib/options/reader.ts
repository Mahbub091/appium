import path from 'node:path';
import {EntryPointStrategy, Options, OptionsReader, Logger} from 'typedoc';
import {AppiumPluginLogger} from '../logger';
import {NS} from '../model';
import {THEME_NAME} from '../theme';

/**
 * List of theme names to override.
 *
 * `default` is what happens if the user does not specify a theme. The markdown plugin,
 * if loaded, will overwrite `default` with `markdown`, so we'll have to overwrite it again.
 *
 * @internal
 */
const OVERRIDE_THEME_NAMES: Readonly<Set<string>> = new Set(['default', 'markdown']);

/**
 * These packages must be resolvable for the plugin to work at all.
 * @internal
 */
const REQUIRED_PACKAGES: Readonly<Set<string>> = new Set(['@appium/base-driver', '@appium/types']);

/**
 * This befouls the options.
 *
 * It can do what has been undone and undo what has been done. It can make real your dreams... or nightmares.
 */
export class AppiumPluginOptionsReader implements OptionsReader {
  readonly #log: AppiumPluginLogger;

  /**
   * I don't know the point of `name`, but the interface requires it, so here.
   */
  public readonly name = 'naughty-appium-options-reader';
  /**
   * This needs to be higher than the value in `MarkdownOptionsReader`.
   */
  public readonly priority = 2000;

  constructor(logger: AppiumPluginLogger) {
    this.#log = logger.createChildLogger('options-reader');
  }

  /**
   * Calls various private methods to override option values or provide defaults.
   * @param container - Options container
   */
  public read(container: Options) {
    this.#configureTheme(container);
    this.#configureEntryPointStrategy(container);
    this.#configureEntryPoints(container);
  }

  /**
   * Forces the `entryPointStrategy` option to be {@linkcode EntryPointStrategy.Packages}
   * @param container Options
   */
  #configureEntryPointStrategy(container: Options) {
    const entryPointStrategy = container.getValue('entryPointStrategy');
    if (entryPointStrategy !== EntryPointStrategy.Packages) {
      container.setValue('entryPointStrategy', EntryPointStrategy.Packages);
      this.#log.verbose('Set option "entryPointStrategy" to "%s"', EntryPointStrategy.Packages);
    }
  }

  /**
   * Adds required packages to the `entryPoints` option.
   *
   * If the `entryPoints` option already contains something that _looks like_ a
   * {@linkcode REQUIRED_PACKAGES required package}, then it is validated via
   * `require.resolve`. If this fails, it is replaced with the proper package path.
   *
   * If a required package cannot be resolved, an error occurs
   * @param container Options
   */
  #configureEntryPoints(container: Options) {
    const entryPoints = container.getValue('entryPoints');
    const newEntryPoints: Set<string> = new Set(entryPoints);

    const addEntryPoint = (entryPoint: string) => {
      try {
        const entryPointPath = path.dirname(require.resolve(`${entryPoint}/package.json`));
        newEntryPoints.add(entryPointPath);
        this.#log.verbose('Added %s to "entryPoint" option', entryPointPath);
      } catch (err) {
        this.#log.error('Could not find required package "%s"', entryPoint);
      }
    };

    for (const reqdEntryPoint of REQUIRED_PACKAGES) {
      const foundReqdEP = entryPoints.find((entryPoint) => entryPoint.includes(reqdEntryPoint));
      if (foundReqdEP) {
        try {
          require.resolve(foundReqdEP);
          this.#log.verbose('entryPoint %s already exists (%s)', reqdEntryPoint, foundReqdEP);
        } catch {
          newEntryPoints.delete(foundReqdEP);
          addEntryPoint(reqdEntryPoint);
          this.#log.warn(
            '"entryPoint" option item matching required package "%s" is invalid or missing (%s); it was replaced',
            reqdEntryPoint,
            foundReqdEP
          );
        }
      } else {
        addEntryPoint(reqdEntryPoint);
      }
    }

    container.setValue('entryPoints', [...newEntryPoints]);
    this.#log.verbose('Final value of "entryPoints" option: %O', container.getValue('entryPoints'));
  }

  /**
   * Forces the theme to be {@linkcode THEME_NAME}
   * @param container Options
   */
  #configureTheme(container: Options) {
    if (OVERRIDE_THEME_NAMES.has(container.getValue('theme'))) {
      container.setValue('theme', THEME_NAME);
      this.#log.verbose('Set option "theme" to "appium"');
    }
  }
}
