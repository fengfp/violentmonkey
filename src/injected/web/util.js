const isConcatSpreadableSym = SafeSymbol.isConcatSpreadable;

export const safeConcat = (...arrays) => {
  const dest = [];
  /* A page can use a getter on Array.prototype that returns false when checked by our code
   * (detectable via `new Error().stack`), so we'll just always set this symbol on our arrays. */
  setOwnProp(dest, isConcatSpreadableSym, true);
  arrays::forEach(arr => setOwnProp(arr, isConcatSpreadableSym, true));
  // Using a dummy [] is simpler/safer/faster than (getOwnProp(arrays, 0), arrays::slice(1))
  return concat::apply(dest, arrays);
};

/**
 * When running in the page context we must beware of sites that override Array#toJSON
 * leading to an invalid result, which is why our jsonDump() ignores toJSON.
 */
export const jsonDump = (value, stack) => {
  let res;
  if (value === null) {
    res = 'null';
  } else if (typeof value === 'object') {
    if (!stack) {
      stack = [value]; // Creating the array here, only when type is object.
    } else if (stack::indexOf(value) >= 0) {
      throw new SafeError('Converting circular structure to JSON');
    } else {
      setOwnProp(stack, stack.length, value);
    }
    if (arrayIsArray(value)) {
      res = '[';
      // Must enumerate all values to include holes in sparse arrays
      for (let i = 0, len = value.length; i < len; i += 1) {
        res += `${i ? ',' : ''}${jsonDump(value[i], stack) ?? 'null'}`;
      }
      res += ']';
    } else {
      res = '{';
      objectKeys(value)::forEach((key) => {
        const v = jsonDump(value[key], stack);
        // JSON.stringify skips keys with `undefined` or incompatible values
        if (v !== undefined) {
          res += `${res.length > 1 ? ',' : ''}${jsonStringify(key)}:${v}`;
        }
      });
      res += '}';
    }
    stack.length -= 1;
  } else if (value !== undefined) {
    res = jsonStringify(value);
  }
  return res;
};

/**
 * 2x faster than `Set`, 5x faster than flat object
 * @param {Object} [hubs]
 */
export const FastLookup = (hubs = createNullObj()) => {
  /** @namespace FastLookup */
  return {
    add(val) {
      getHub(val, true)[val] = true;
    },
    clone() {
      const clone = createNullObj();
      if (process.env.DEBUG) throwIfProtoPresent(clone);
      for (const group in hubs) { /* proto is null */// eslint-disable-line guard-for-in
        clone[group] = createNullObj(hubs[group]);
      }
      return FastLookup(clone);
    },
    delete(val) {
      delete getHub(val)?.[val];
    },
    has: val => getHub(val)?.[val],
    toArray: () => {
      const values = objectValues(hubs);
      values::forEach((val, i) => { values[i] = objectKeys(val); });
      return safeConcat::apply(null, values);
    },
  };
  function getHub(val, autoCreate) {
    const group = val.length ? val[0] : ''; // length is unforgeable, index getters aren't
    const hub = hubs[group] || (
      autoCreate ? (hubs[group] = createNullObj())
        : null
    );
    return hub;
  }
};

/**
 * Adding the polyfills in Chrome (always as it doesn't provide them)
 * and in Firefox page mode (while preserving the native ones in content mode)
 * for compatibility with many [old] scripts that use these utils blindly
 */
export const makeComponentUtils = () => {
  const CREATE_OBJECT_IN = 'createObjectIn';
  const EXPORT_FUNCTION = 'exportFunction';
  const src = IS_FIREFOX && !process.env.HANDSHAKE_ID && global;
  const defineIn = !src && ((target, as, val) => {
    if (as && (as = getOwnProp(as, 'defineAs'))) {
      setOwnProp(target, as, val);
    }
    return val;
  });
  return {
    cloneInto: cloneInto || (
      obj => obj
    ),
    [CREATE_OBJECT_IN]: src && src[CREATE_OBJECT_IN] || (
      (target, as) => defineIn(target, as, {})
    ),
    [EXPORT_FUNCTION]: src && src[EXPORT_FUNCTION] || (
      (func, target, as) => defineIn(target, as, func)
    ),
  };
};
