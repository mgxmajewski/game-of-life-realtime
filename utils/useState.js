'use strict';

exports.useState = (initial) => {

    let state = initial;

    return [() => state, (v) => {

        state = v;
    }];
};
