const Boom = require('@hapi/boom')
const Hoek = require('@hapi/hoek')
const { logger } = require('defra-logging-facade')
const yaml = require('js-yaml')
const fs = require('fs')

const journeyRouteTag = 'hapi-journey-map-route'

const queryData = {}

// Initialised and will be built up later
let routeMap = {}

const JourneyMap = {
  clearMap: () => {
    routeMap = {}
  },

  register: (server, options) => {
    const { modulePath, setQueryData, getQueryData, journeyMapPath = '/journey-map' } = options

    // Register set and get functions for query data
    queryData.set = setQueryData
    queryData.get = getQueryData

    // Build the route map
    Object.assign(routeMap, buildMap(modulePath))

    // Register the hapi routes
    registerRoutes(server, routeMap, { app: { modulePath } })

    // Register the journey map inquiry route
    registerInquiryRoute(server, journeyMapPath, modulePath)

    // Provide routing on the post handler
    server.ext('onPostHandler', JourneyMap.handlePostHandler)
  },

  setQueryData: (...args) => queryData.set(...args),

  getQueryData: (...args) => queryData.get(...args),

  getCurrent: (request) => {
    const { id } = request.route.settings.app
    return { ...routeMap[id], id }
  },

  getRoute: (id) => ({ ...routeMap[id], id }),

  getModule: (module = '', path) => {
    const map = module ? `${module}/${module}.map.yml` : 'map.yml'
    return yaml.safeLoad(fs.readFileSync(`${path}/${map}`, 'utf8'))
  },

  getMap: (modulePath) => {
    if (!Object.keys(routeMap).length) {
      // routeMap is empty so build it
      Object.assign(routeMap, buildMap(modulePath))
    }
    return Hoek.clone(routeMap)
  },

  requireRoute: (location) => require(location),

  isJourneyRoute: (request) => {
    const { tags = [] } = request.route.settings
    return tags.includes(journeyRouteTag)
  },

  handlePostHandler: async (request, h) => {
    // Let requests from routes not created by the journey map continue
    if (!JourneyMap.isJourneyRoute(request)) {
      return h.continue
    }

    const route = JourneyMap.getCurrent(request)
    const { next = '', id, path } = route
    const { response = {} } = request
    const { variety, statusCode = 500 } = response

    // Continue if a view or a redirect is returned
    if (variety === 'view' || statusCode === 302) {
      return h.continue
    }

    const getPath = (path) => {
      const params = path.match(/(?<=\{)(.*)(?=\})/g)
      if (params) {
        params.forEach((param) => {
          const data = queryData.get(request)[param]
          if (data === undefined) {
            logger.error(`Route "${id}" with path "${path}" failed to set parameter "${param}"`)
          } else {
            path = path.replace(`{${param}}`, data)
          }
        })
      }
      return path
    }

    const navigateNext = (next) => {
      if (next) {
        if (next.query) {
          const result = queryData.get(request)[next.query] || 'otherwise'
          const nextRoute = next.when[result]
          if (nextRoute) {
            return navigateNext(nextRoute)
          }
          return Boom.badImplementation(`Route "${id}" with path "${path}" set incorrect value "${result}" for query "${next.query}"`)
        }
        return h.redirect(getPath(routeMap[next].path))
      }
      return h.continue
    }

    return navigateNext(next)
  }
}

function registerRoutes (server, map, options = {}) {
  return Object.entries(map).map(([id, { path, route }]) => {
    try {
      // retrieve the app object from options
      const { app, tags = [] } = options
      // add the id of the route to app in route options so that it can be used to identify the route in the function getCurrent defined above
      // add the "journeyRouteTag" to identify routes created by the journey map plugin
      options = { ...options, app: { ...app, id }, tags: [...tags, journeyRouteTag] }
      // merge the required route definition with the path and options
      const methods = []
      let config = JourneyMap.requireRoute(`${app.modulePath}/${route}`)
      if (!Array.isArray(config)) {
        config = [config]
      }
      config
        .flat()
        .map((config) => {
          methods.push(config.method)
          config = { ...config, path }
          Hoek.merge(config, { options })
          return config
        })
        .forEach((config) => {
          try {
            server.route(config)
          } catch (e) {
            logger.error(`Route "${id}" with path "${path}" failed to be registered`)
            logger.error(e)
          }
        })
      // Make a note of the methods on this route
      map[id].method = methods.flat()
    } catch (e) {
      logger.error(e.message)
    }
  })
}

function loadMap (parentModule = '', parentConfig = {}) {
  const {
    id: parentId = '',
    path: parentPath = '',
    moduleId,
    modulePath
  } = parentConfig

  const entries = Object.entries(JourneyMap.getModule(parentModule, modulePath)).map(([id, options]) => {
    return { ...options, id }
  })

  return entries.map((options, index, list) => {
    const adjacent = index === list.length - 1 ? 'return' : list[index + 1].id
    let {
      id,
      path = '',
      route,
      next = adjacent, // defaults next to the adjacent node
      module
    } = options

    id = parentId ? `${parentId}:${id}` : id
    route = parentModule ? `${parentModule}/${route}` : route
    path = parentPath + path

    const buildNext = (next) => {
      if (next.query) {
        Object.entries(next.when).map(([prop, val]) => {
          next.when[prop] = buildNext(val)
        })
        next.when.otherwise = buildNext(adjacent)
        return next
      } else if (next === 'return') {
        /** returns back to calling module **/
        return parentConfig.next
      } else {
        return moduleId ? `${moduleId}:${next}` : next
      }
    }
    next = buildNext(next)

    const config = { ...options, id, path, next }
    if (route) {
      config.route = route
    }
    if (parentConfig.id) {
      const { id, path, options, parent } = parentConfig
      config.parent = { id, path, options }
      if (parent) {
        // allow parent access
        config.parent.parent = parent
      }
    }
    if (module) {
      return loadMap(module, { ...config, moduleId: id, module, modulePath })
    }
    return config
  }).flat()
}

function fixMapNav (config) {
  Object.values(config).forEach((item) => {
    const fixNext = (next) => {
      if (config[next]) {
        return next
      }
      return Object.keys(config).find((id) => id.startsWith(next + ':')) || next
    }
    const { next } = item
    if (next) {
      if (next.query) {
        Object.entries(next.when).map(([prop, val]) => {
          next.when[prop] = fixNext(val)
        })
        item.next = next
      } else {
        item.next = fixNext(item.next)
      }
    } else {
      delete item.next
    }
  })
  return config
}

// convert an array of routes into an object where the key for each route is the route id
function buildMap (path) {
  const map = loadMap('', { modulePath: path }).reduce((map, route) => {
    return { ...map, [route.id]: route }
  }, {})
  // Now fix any "next" values pointing to a module so that they point to the first route in the module map
  return fixMapNav(map)
}

function registerInquiryRoute (server, journeyMapPath, modulePath) {
  server.route({
    method: 'GET',
    path: journeyMapPath,
    handler: async (request, h) => {
      return h.response(JourneyMap.getMap(modulePath))
    }
  })
}

module.exports = JourneyMap
