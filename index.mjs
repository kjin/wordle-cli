import { Chalk } from 'chalk';
import { promises as fs, writeFileSync } from 'fs';
import { promises as rl } from 'readline';
import { homedir, tmpdir } from 'os';
import * as path from 'path';
import shuffle from 'knuth-shuffle-seeded';
import fetch from 'node-fetch';

if (Number(process.versions.node.split('0')) < 17) {
  // Node will already crash before this point anyway
  console.log('Requires Node 17+');
  process.exit(1);
}

const chalk = new Chalk();

const game = process.env.GAME;
const user = process.env.USER;
const hasGame = typeof game === 'string';
const numLetters = Number(process.argv[2]) || 5;
const numGuesses = Number(process.argv[3]) || numLetters + 1;

const saveKey = `${game}-${user}-${numLetters}-${numGuesses}`;
const randomKey = `${game}-${numLetters}-${numGuesses}`;
let save = {};
if (hasGame) {
  try {
    save = JSON.parse(await fs.readFile(`${homedir()}/.wordle`, 'utf8'));
  } catch (e) {}
}
if (!save[saveKey]) {
  save[saveKey] = [];
}
const finish = (normal) => {
  if (!normal) {
    console.log();
  }
  if (hasGame) {
    writeFileSync(`${homedir()}/.wordle`, JSON.stringify(save), 'utf8');
  }
  if (!normal) {
    process.exit(0);
  }
};

async function getMaybeCached(url) {
  const urlObj = new URL(url);
  const filePath = path.join(tmpdir(), urlObj.pathname.split('/').slice(-1)[0]);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (e) {
    const file = await (await (await fetch(url)).blob()).text();
    await fs.writeFile(filePath, file, 'utf8');
    return file;
  }
}

const allWords = (
  await getMaybeCached('https://www.gutenberg.org/files/3201/files/CROSSWD.TXT')
)
  .split(/\r?\n/)
  .filter((x) => x.length === numLetters);
const candidateWords = (
  await getMaybeCached(
    'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt'
  )
)
  .split(/\r?\n/)
  .filter((x) => allWords.includes(x))
  .filter((x) => x.length === numLetters);

const userSortedWords = hasGame
  ? shuffle(candidateWords, randomKey)
  : candidateWords;
const index = hasGame
  ? save[saveKey].length
  : Math.floor(Math.random() * candidateWords.length);
const word = userSortedWords[index];
const guesses = [];

function renderGuesses() {
  let result = '==========\n';
  const greens = new Set();
  const yellows = new Set();
  const grays = new Set();
  for (let i = 0; i < numGuesses; i++) {
    if (guesses[i]) {
      const guess = guesses[i];
      const seen = new Map();
      for (let j = 0; j < numLetters; j++) {
        if (guess[j] !== word[j]) {
          seen.set(word[j], (seen.get(word[j]) || 0) + 1);
        }
      }
      for (let j = 0; j < numLetters; j++) {
        if (guess[j] === word[j]) {
          result += chalk.bgGreen.black(guess[j]);
          greens.add(guess[j]);
        } else if ((seen.get(guess[j]) || 0) >= 1) {
          result += chalk.bgYellow.black(guess[j]);
          yellows.add(guess[j]);
          seen.set(guess[j], (seen.get(guess[j]) || 0) - 1);
        } else {
          result += chalk.bgWhite.black(guess[j]);
          grays.add(guess[j]);
        }
      }
    } else {
      result += new Array(numLetters).fill('_').join('');
    }
    result += '\n';
  }
  const highlight = (x) => {
    if (greens.has(x)) return chalk.bgGreen.black(x);
    if (yellows.has(x)) return chalk.bgYellow.black(x);
    if (grays.has(x)) return chalk.bgWhite.black(x);
    return x;
  };
  result += '----------\n';
  result += ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
    .map((line) => line.split('').map(highlight).join('') + '\n')
    .join('');
  result += '----------';
  return result;
}

const prompt = new rl.createInterface({
  input: process.stdin,
  output: process.stdout,
});

prompt.on('SIGINT', finish);
process.on('SIGINT', finish);

console.log(
  'WORDLE',
  ...(hasGame
    ? [`- Puzzle #${index + 1}/${candidateWords.length} for ${user}`]
    : [])
);

const start = Date.now();
let correct = false;
for (let i = 0; i < numGuesses; i++) {
  let answer;
  do {
    console.log(renderGuesses());
    answer = (
      await prompt.question(
        `Enter guess ${i + 1}/${numGuesses} (${numLetters} letters):\n> `
      )
    ).toLowerCase();
  } while (!allWords.includes(answer));
  guesses.push(answer);
  if (i === 0) {
    save[saveKey].push([word, guesses]);
  }
  if (answer === word) {
    correct = true;
    break;
  }
}
const time = Date.now() - start;
prompt.close();
console.log(renderGuesses());
console.log(`Answer: ${word}`);
if (correct) {
  console.log(
    `Guessed in ${guesses.length}/${numGuesses} guesses (${time / 1000}sec)`
  );
  save[saveKey][save[saveKey].length - 1].push(time);
}

finish(true);
