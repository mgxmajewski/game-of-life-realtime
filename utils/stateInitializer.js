/**
 * @param array
 * @param initialGrid
 * @param userID
 */
exports.stateInitializer = (array, initialGrid, userID) => {
    array.push(
        {
            id: userID,
            user: 'Server Starter',
            grid: initialGrid
        }
    )
}