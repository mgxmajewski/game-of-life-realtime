/**
 * @param array
 * @param initialGrid
 */
exports.stateInitializer = (array, initialGrid) => {
    array.push(
        {
            id: 0,
            user: 'Server Starter',
            grid: initialGrid
        }
    )
}