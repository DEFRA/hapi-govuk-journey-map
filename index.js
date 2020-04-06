const pkg = require('./package')
const { register, setQueryData, getQueryData, getCurrent, getRoute, getMap, isJourneyRoute } = require('./lib/journey-map')

exports.plugin = {
  name: pkg.name,
  register,
  once: true,
  pkg
}

exports.setQueryData = setQueryData
exports.getQueryData = getQueryData
exports.getCurrent = getCurrent
exports.getRoute = getRoute
exports.getMap = getMap
exports.isJourneyRoute = isJourneyRoute
