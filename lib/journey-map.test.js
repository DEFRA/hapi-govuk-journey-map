// Identify node environment as "unit-test"
process.env.NODE_ENV = 'unit-test'

const sinon = require('sinon')
const Lab = require('@hapi/lab')
const Hoek = require('@hapi/hoek')
const { expect } = require('@hapi/code')
const { afterEach, beforeEach, describe, it } = exports.lab = Lab.script()
const JourneyMap = require('./journey-map')
const { register } = JourneyMap

const server = {
  route: () => {},
  ext: () => {}
}

describe('Load', () => {
  beforeEach(({ context }) => {
    // Create a sinon sandbox to stub methods
    context.sandbox = sinon.createSandbox()

    // Create a fake request
    context.request = {
      route: {
        settings: {
          app: {},
          tags: ['journey-route']
        }
      },
      queryData: {}
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
      const { options } = context
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
          next: undefined,
          method: ['GET', 'POST']
        }
      })
    })

    it('navigates correctly', ({ context }) => {
      const { request } = context
      const { app } = request.route.settings

      // get the home route in the map
      app.id = 'home'

      let nextPath

      // make sure the redirect is to the next
      const redirect = (path) => {
        nextPath = path
      }

      JourneyMap.handlePostHandler(request, { request, redirect })

      expect(nextPath).to.equal('/complete')
    })
  })

  describe('branching map', () => {
    beforeEach(async ({ context }) => {
      const { options } = context
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
        complete: {
          path: '/complete',
          route: 'complete.route',
          id: 'complete',
          next: undefined,
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
        }
      })
    })

    describe('navigates correctly', () => {
      let journey
      let results

      // make sure the redirect is to the next
      const redirect = (path) => {
        journey.push(path)
      }

      const handlePostHandler = async (request, setQueryData) => {
        const { app } = request.route.settings
        if (setQueryData) {
          setQueryData()
        }
        results.push(await JourneyMap.handlePostHandler(request, { request, redirect }))
        app.id = journey[journey.length - 1].substr(1)
      }

      beforeEach(({ context }) => {
        const { request } = context
        const { app } = request.route.settings

        // get the home route in the map
        app.id = 'home'

        journey = ['/home']
        results = []
      })

      it('when the answer to question-1 is yes', async ({ context }) => {
        const { request, options } = context
        const { setQueryData } = options

        await handlePostHandler(request)
        await handlePostHandler(request, () => setQueryData(request, { answer: 'yes' }))
        await handlePostHandler(request)

        expect(journey).to.equal(['/home', '/question-1', '/complete'])
      })

      it('when the answer to question-1 is no and there is no reference for it', async ({ context }) => {
        const { request, options } = context
        const { setQueryData } = options

        await handlePostHandler(request)
        await handlePostHandler(request, () => setQueryData(request, { answer: 'no' }))
        expect(results.pop().isBoom).to.equal(true)
      })

      it('when the answer to question-1 is not set', async ({ context }) => {
        const { request } = context

        await handlePostHandler(request)
        await handlePostHandler(request)
        await handlePostHandler(request)

        expect(journey).to.equal(['/home', '/question-1', '/question-2', '/complete'])
      })
    })
  })
})
