// Identify node environment as "unit-test"
process.env.NODE_ENV = 'unit-test'

const sinon = require('sinon')
const Lab = require('@hapi/lab')
const Hoek = require('@hapi/hoek')
const { expect } = require('@hapi/code')
const { afterEach, beforeEach, describe, it } = exports.lab = Lab.script()
const JourneyMap = require('./journey-map')
const { register } = JourneyMap

const journeyRouteTag = 'hapi-journey-map-route'

describe('Load', () => {
  const getRoute = ({ map, journey }) => Object.values(map).find(({ path }) => path === journey[journey.length - 1])
  const handlePostHandler = async ({ request, map, journey, results }, setQueryData) => {
    if (setQueryData) {
      setQueryData()
    }
    results.push(await JourneyMap.handlePostHandler(request, { request, redirect: (path) => journey.push(path) }))
    const route = getRoute({ map, journey })
    request.route.settings.app.id = route.id
  }

  beforeEach(({ context }) => {
    JourneyMap.clearMap()

    // Create a sinon sandbox to stub methodsmap
    context.sandbox = sinon.createSandbox()

    // Create a fake request
    context.request = {
      route: {
        settings: {
          app: {},
          tags: [journeyRouteTag]
        }
      },
      queryData: {}
    }

    context.server = {
      route: () => {},
      ext: () => {}
    }

    context.options = {
      getQueryData: (request) => {
        return { ...request.queryData }
      },
      setQueryData: (request, data) => {
        Hoek.merge(request.queryData, data)
      }
    }

    const { sandbox } = context

    sandbox.stub(JourneyMap, 'requireRoute').value(() => {
      return { method: ['GET', 'POST'] }
    })
  })

  afterEach(({ context }) => {
    const { sandbox } = context

    // Restore the sandbox to make sure the stubs are removed correctly
    sandbox.restore()
  })

  describe('simple map', () => {
    beforeEach(async ({ context }) => {
      const { server, options } = context
      options.modulePath = './examples/simple'
      await register(server, options)
      context.map = JourneyMap.getMap()
    })

    it('is loaded ok', async ({ context }) => {
      const { map } = context
      expect(map).to.equal({
        home: {
          path: '/',
          route: 'home.route',
          id: 'home',
          next: 'complete',
          method: ['GET', 'POST']
        },
        complete: {
          path: '/complete',
          route: 'complete.route',
          id: 'complete',
          method: ['GET', 'POST']
        }
      })
    })

    describe('navigates correctly', () => {
      beforeEach(({ context }) => {
        const { request } = context
        const { app } = request.route.settings
        context.journey = ['/']
        const route = getRoute(context)
        app.id = route.id
        context.results = []
      })

      it('modules map', async ({ context }) => {
        await handlePostHandler(context)

        expect(context.journey).to.equal(['/', '/complete'])
      })
    })
  })

  describe('modules map', () => {
    beforeEach(async ({ context }) => {
      const { server, options } = context
      options.modulePath = './examples/modules'
      await register(server, options)
      context.map = JourneyMap.getMap()
    })

    it('is loaded ok', async ({ context }) => {
      const { map } = context
      expect(map).to.equal({
        home: {
          path: '/',
          route: 'home.route',
          id: 'home',
          next: 'quiz:question-1',
          method: ['GET', 'POST']
        },
        'quiz:question-1': {
          path: '/quiz/question-1',
          route: 'questions/question-1.route',
          parent: {
            id: 'quiz',
            options: { title: 'Super quiz' },
            path: '/quiz'
          },
          next: 'quiz:question-2',
          id: 'quiz:question-1',
          method: ['GET', 'POST']
        },
        'quiz:question-2': {
          path: '/quiz/question-2',
          route: 'questions/question-2.route',
          id: 'quiz:question-2',
          parent: {
            id: 'quiz',
            options: { title: 'Super quiz' },
            path: '/quiz'
          },
          next: 'quiz:question-3:quick-fire',
          method: ['GET', 'POST']
        },
        'quiz:question-3:quick-fire': {
          id: 'quiz:question-3:quick-fire',
          method: [
            'GET',
            'POST'
          ],
          parent: {
            id: 'quiz:question-3',
            options: {
              title: 'Question 3 is a bonus round'
            },
            parent: {
              id: 'quiz',
              options: {
                title: 'Super quiz'
              },
              path: '/quiz'
            },
            path: '/quiz/question-3'
          },
          next: 'complete',
          path: '/quiz/question-3/quick-fire',
          route: 'bonus/quick-fire.route'
        },
        complete: {
          path: '/complete',
          route: 'complete.route',
          id: 'complete',
          method: ['GET', 'POST']
        }
      })
    })

    describe('navigates correctly', () => {
      beforeEach(({ context }) => {
        const { request } = context
        const { app } = request.route.settings
        context.journey = ['/']
        const route = getRoute(context)
        app.id = route.id
        context.results = []
      })

      it('modules map', async ({ context }) => {
        await handlePostHandler(context)
        await handlePostHandler(context)
        await handlePostHandler(context)
        await handlePostHandler(context)
        await handlePostHandler(context)

        expect(context.journey).to.equal(['/', '/quiz/question-1', '/quiz/question-2', '/quiz/question-3/quick-fire', '/complete'])
      })
    })
  })

  describe('branching map', () => {
    beforeEach(async ({ context }) => {
      const { server, options } = context
      options.modulePath = './examples/branching'
      await register(server, options)
      context.map = JourneyMap.getMap()
    })

    it('is loaded ok', async ({ context }) => {
      const { map } = context
      expect(map).to.equal({
        home: {
          path: '/',
          route: 'home.route',
          id: 'home',
          next: 'question-1',
          method: ['GET', 'POST']
        },
        'question-1': {
          path: '/question-1',
          route: 'question-1.route',
          next: { query: 'answer', when: { yes: 'complete', otherwise: 'question-2' } },
          id: 'question-1',
          method: ['GET', 'POST']
        },
        'question-2': {
          path: '/question-2',
          route: 'question-2.route',
          id: 'question-2',
          next: 'complete',
          method: ['GET', 'POST']
        },
        complete: {
          path: '/complete',
          route: 'complete.route',
          id: 'complete',
          method: ['GET', 'POST']
        }
      })
    })

    describe('navigates correctly', () => {
      beforeEach(({ context }) => {
        const { request } = context
        const { app } = request.route.settings
        context.journey = ['/']
        const route = getRoute(context)
        app.id = route.id
        context.results = []
      })

      it('when the answer to question-1 is yes', async ({ context }) => {
        const { request, options, journey } = context
        const { setQueryData } = options

        await handlePostHandler(context)
        await handlePostHandler(context, () => setQueryData(request, { answer: 'yes' }))
        await handlePostHandler(context)

        expect(journey).to.equal(['/', '/question-1', '/complete'])
      })

      it('when the answer to question-1 is no and there is no reference for it', async ({ context }) => {
        const { request, options, results } = context
        const { setQueryData } = options

        await handlePostHandler(context)
        await handlePostHandler(context, () => setQueryData(request, { answer: 'no' }))
        expect(results.pop().isBoom).to.equal(true)
      })

      it('when the answer to question-1 is not set', async ({ context }) => {
        const { journey } = context

        await handlePostHandler(context)
        await handlePostHandler(context)
        await handlePostHandler(context)

        expect(journey).to.equal(['/', '/question-1', '/question-2', '/complete'])
      })
    })
  })
})
