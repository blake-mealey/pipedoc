import { GluegunToolbox } from 'gluegun';
import {
  generate,
  GenerateOptions,
  TemplateMetaData,
} from 'az-pipelines-documenter';
import { glob } from 'glob';
import { promisify } from 'util';
import { basename } from 'path';
import simpleGit from 'simple-git/promise';
import GitUrlParse from 'git-url-parse';

const globAsync = promisify(glob);

module.exports = {
  name: 'generate',
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters: { array: patterns, options },
      filesystem: { writeAsync, readAsync },
    } = toolbox;

    async function getGitUrl() {
      try {
        const git = simpleGit();
        const remotes = await git.getRemotes(true);
        const remote =
          remotes.find(({ name }) => name === 'origin') ?? remotes[0];
        return GitUrlParse(remote?.refs.fetch);
      } catch (e) {
        return;
      }
    }

    function getRepoDetails(gitUrl: any) {
      if (!gitUrl) {
        return;
      }

      const sourceToType = {
        'azure.com': 'git',
        'dev.azure.com': 'git',
        'visualstudio.com': 'git',
        'github.com': 'github',
        'bitbucket.org': 'bitbucket',
      };

      return {
        name: `${gitUrl.owner}/${gitUrl.name}`,
        type: sourceToType[gitUrl.source],
      };
    }

    const gitUrl = await getGitUrl();
    const repoDetails = getRepoDetails(gitUrl);

    // Load options
    const repoIdentifier: string = options.repoIdentifier ?? 'templates';
    const projectName: string | undefined = options.projectName ?? gitUrl.name;

    const files = (
      await Promise.all(
        patterns.map((pattern) =>
          globAsync(pattern, {
            ignore: ['node_modules', '.git'],
          })
        )
      )
    ).flat();

    const generateOptions: Partial<GenerateOptions> = {
      headingDepth: 2,
    };

    const meta: Partial<TemplateMetaData> = {
      repo: {
        ...repoDetails,
        identifier: repoIdentifier,
      },
    };

    const markdown = await Promise.all(
      files
        .filter((file) => file.endsWith('.yml') || file.endsWith('yaml'))
        .map(async (file) => {
          return generate(
            await readAsync(file),
            {
              ...meta,
              name: basename(file, file.substring(file.indexOf('.'))),
              filePath: file,
            },
            generateOptions
          );
        })
    );

    await writeAsync('docs.md', `# ${projectName}\n\n` + markdown.join('\n'));
  },
};
