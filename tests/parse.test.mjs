import assert from 'node:assert/strict';
import { parseShare, puzzleForDate, dateForPuzzle, points } from '../parse.js';

const sample = `Wordle 1,938 6/6

🟨🟨🟨⬜⬜
⬜⬜⬜⬜⬜
⬜🟩🟨🟩⬜
⬜🟩⬜🟩🟩
⬜🟩⬜🟩🟩
🟩🟩🟩🟩🟩`;
const r = parseShare(sample);
assert.equal(r.puzzle, 1938);
assert.equal(r.score, 6);
assert.equal(r.hard, false);
assert.deepEqual(r.grid, ['yyybb', 'bbbbb', 'bgygb', 'bgbgg', 'bgbgg', 'ggggg']);

const fail = parseShare('Wordle 1,937 X/6*\n\n⬛⬛🟧⬛🟦\n🟧🟧🟧🟧⬛');
assert.equal(fail.score, 'X');
assert.equal(fail.hard, true);
assert.deepEqual(fail.grid, ['bbgby', 'ggggb']);

assert.equal(parseShare('Wordle 1.938 3/6').puzzle, 1938); // European separators
assert.equal(parseShare('Wordle 999 1/6').score, 1);
assert.equal(parseShare('hello'), null);

assert.equal(puzzleForDate(new Date(2026, 9, 9)), 1938);
assert.equal(dateForPuzzle(1938).toDateString(), new Date(2026, 9, 9).toDateString());
assert.equal(puzzleForDate(new Date(2021, 5, 19)), 0);
assert.equal(points('X'), 7);
assert.equal(points(4), 4);
console.log('all parse tests passed');
