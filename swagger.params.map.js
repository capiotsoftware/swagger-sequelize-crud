// Purpose : map every key to its value

var map = (req) =>
    Object.keys(req.swagger.params).reduce((prev, curr) => {
        prev[curr] = req.swagger.params[curr].value;
        return prev;
    }, {});

module.exports = { map: map };