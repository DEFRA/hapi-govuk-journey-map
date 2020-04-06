# Hapi GOV.UK Journey Map

[![Build Status](https://travis-ci.com/DEFRA/hapi-govuk-journey-map.svg?branch=master)](https://travis-ci.com/DEFRA/hapi-govuk-journey-map)
[![Known Vulnerabilities](https://snyk.io/test/github/defra/hapi-govuk-journey-map/badge.svg)](https://snyk.io/test/github/defra/hapi-govuk-journey-map)
[![Code Climate](https://codeclimate.com/github/DEFRA/hapi-govuk-journey-map/badges/gpa.svg)](https://codeclimate.com/github/DEFRA/hapi-govuk-journey-map)
[![Test Coverage](https://codeclimate.com/github/DEFRA/hapi-govuk-journey-map/badges/coverage.svg)](https://codeclimate.com/github/DEFRA/hapi-govuk-journey-map/coverage)

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
    - [Registering](#registering)
    - [Mapping](#mapping)
    - [File structure](#file-structure)
    - [Branching](#branching)

## Overview
This plugin makes it easier to visualise, create and maintain journeys through a hapi web service.

It achieves this by placing reusable journeys into modules each containing a set of pages or
routes that when combined make a self contained reusable journey.

Examples of such modules would be an address module, a contact module and a file upload module.

A way of configuring the journey within the module and connections between modules is with mapping files.
Within the POC, [YAML](https://yaml.org/start.html) was used to describe the journey configuration within
each mapping file.

## Installation
Via github:
```
npm install --save https://github.com/DEFRA/hapi-govuk-journey-map.git#master
```

It is recommended that tie to a specific commit/version as follows:
```
npm install --save https://github.com/DEFRA/hapi-govuk-journey-map.git#commit_or_version
```

## Usage
The best way to describe this is with an example:

### Registering
Please note that the required "setQueryData" and "getQueryData" functions will be explained in [Branching](#branching).

Register the plugin as follows:
```js
const cache = {}

const { resolve } = require('path')

module.exports = {
  plugin: require('hapi-govuk-journey-map'),
  options: {
    modulePath: resolve(`${process.cwd()}/src/server/modules`),
    setQueryData: (request, data) => {
      Object.assign(cache, data)
    },
    getQueryData: (request) => {
      return { ...cache }
    },
    journyMapPath: '/journey-map'
  }
}
```

### Mapping
Please note that each of the entries within the following files ultimately generate routes within a hapi service.

Example mapping files for a simple journey:
- Root map:
```yaml
--- # Root map 

home:
  path: "/"
  route: home.route

applicant:
  path: "/applicant"
  module: contact

complete:
  path: "/complete"
  route: complete.route
```
- Contact map:
```yaml
--- # Contact map

name:
  path: "/name"
  route: contact-name.route

address:
  path: "/address"
  module: address

email:
  path: "/email"
  route: contact-email.route
``` 
- Address map:
```yaml
--- # Address map

search:
  path: "/search"
  route: address-search.route
  
select:
  path: "/select"
  route: address-select.route

entry:
  path: "/entry"
  route: address-entry.route
```

The idea is that the navigation through the routes (pages) starts in the root map and flows through each adjacent route.  When the module property is set, the flow moves
to the start of that modules map and flows through that map.  After processing the last route, the flow returns to the previous map and continues.

As I have included no [branching](#branching) in the above map, I would expect the paths (pages) to be traversed in the following order:
```text
- /
- /applicant/name
- /applicant/address/search
- /applicant/address/select
- /applicant/address/entry
- /applicant/email
- /complete
```
Note that the paths are generated with the parent module path prefixing the current path in each module's map.

The routemap object can be retrieved with the `getRouteMap` function.

### File structure
The file structure in the project for these modules would be as follows:
```text
.
+-- modules
|   +-- complete.route.js
|   +-- home.route.js
|   +-- map.yml
|   +-- address
|   |   +--address.map.yaml
|   |   +--address-entry.view.njk
|   |   +--address-entry.route.js
|   |   +--address-search.view.njk
|   |   +--address-search.route.js
|   |   +--address-select.view.njk
|   |   +--address-select.route.js
|   +-- contact
|   |   +--contact.map.yaml
|   |   +--contact-email.view.njk
|   |   +--contact-email.route.js
|   |   +--contact-name.view.njk
|   |   +--contact-name.route.js

```

The following is an example of a route file.  I have chosen "contact-name.route.js" for this purpose.
Please note that in the following example "Application" is used to persist the contact name:

```js
const Application = require('../../dao/application')
const view = 'contact/contact-name.view.njk'
const pageHeading = 'Please enter your name'

module.exports = [{
  method: 'GET',
  handler: async function (request, h) {
    const { contact = {} } = await Application.get(request)
    return h.view(view, {
      pageHeading,
      value: contact.name
    })
  }
}, {
  method: 'POST',
  handler: async function (request, h) {
    const { contact = {} } = await Application.get(request)
    const { name = '' }  = request.payload
    contact.name = name
    await Application.update(request, { contact })
    return h.continue
  }
}]
```

### Branching
In order to allow branching, it's necessary to allow a query to be asked
with a set of alternative routes to go to based on the result of that query.

```yaml
--- # Address map

manual-check:
  path: "/manual-check"
  route: address-manual-check
  next:
    query: postcodeLookUpEnabled
    when:
      yes: search
      no: entry

search:
  path: "/search"
  route: address-search.route
  
select:
  path: "/select"
  route: address-select.route

entry:
  path: "/entry"
  route: address-entry.route
```
In the above map, the value of "postcodeLookUpEnabled" (please notes that you can call this 
query whatever you like) is used to determine the branching.

In the above case a value of "yes" would branch to "search" where as "no" would skip both
"search" and "select" and jump straight to "entry"

In order to make this work the "postcodeLookUpEnabled" value needs to be set to "yes" or "no" within the route file.
This can be done using the "setQueryData" method.

Please see the extract of a route file below as an example:

```js
.
.
const { setQueryData } = require('hapi-govuk-journey-map')
.
.
}, {
  method: 'POST',
  handler: async function (request, h) {
    if (process.env.POSTCODE_LOOKUP_ENABLED) {
      setQueryData(request, { postcodeLookUPEnabled: 'yes'})    
    } else {
      setQueryData(request, { postcodeLookUPEnabled: 'no'})    
    } 
    return h.continue
  }
}
.
.
.
```

### Enquiry routes

The enquiry routes will be available if the journeyMapPath option is configured
In the following example the journeyMapPath is set to '/journey-map'
```
/journey-map
/journey-map/{id}
```
These routes will be automatically loaded when the plugin is registered to return json describing the internal generated map

### Development and Test

When developing this plugin, simply clone this repository

> `git clone https://github.com/DEFRA/hapi-govuk-journey-map.git`

and run

> `npm install`

## Running tests

Unit tests can be run using

> `npm run unit-test`

## Contributing to this project

If you have an idea you'd like to contribute please log an issue.

All contributions should be submitted via a pull request.

Note that we use [Standard JS](https://standardjs.com/) style, you can check your code using

> `npm run lint`

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.