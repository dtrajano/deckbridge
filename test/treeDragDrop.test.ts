import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDraggedSessionIds, encodeDraggedSessionIds } from '../src/treeDragDrop';

test('serializes unique session ids for tree dragging', () => {
  assert.equal(encodeDraggedSessionIds(['a', 'a', '', 'b']), '["a","b"]');
});

test('ignores malformed tree drag payloads', () => {
  assert.deepEqual(decodeDraggedSessionIds('{bad'), []);
  assert.deepEqual(decodeDraggedSessionIds('{"id":"a"}'), []);
  assert.deepEqual(decodeDraggedSessionIds('["a",3,"", "b"]'), ['a', 'b']);
});
