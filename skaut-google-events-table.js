const tagName = 'skaut-google-events-table'

class SkautGoogleEventsTable extends HTMLElement {
  constructor() {
    super()
    this.config = {
      timeMin: new Date().toISOString(),
      orderBy: 'startTime',
      singleEvents: 'True',
    }
    this.exclude = []
    this.categories = []
    this.calendarId = ''
  }

  connectedCallback() {
    if (this.getAttribute('categories')) {
      this.categories = this.getAttribute('categories').split(',')
    }
    if (this.getAttribute('exclude')) {
      this.exclude = this.getAttribute('exclude').split(',')
    }
    if (this.getAttribute('allKeyword')) {
      this.allKeyword = this.getAttribute('allKeyword')
    }
    this.calendarId = this.getAttribute('calendarId')
    this.apiKey = this.getAttribute('apiKey')
    this.account = this.getAttribute('account')

    const template = document.createElement('template')
    template.innerHTML = this.buildTemplate(this.categories, this.calendarId)

    // @ts-ignore
    window.ShadyCSS && window.ShadyCSS.prepareTemplate(template, tagName)
    // @ts-ignore
    window.ShadyCSS && window.ShadyCSS.styleElement(this)
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.appendChild(template.content.cloneNode(true))
    }

    this.fetchEvents().then(() => {
      this.attachDOMEvents()
      this.render(this.everything)
    })
  }

  attributeChangedCallback(name, oldValue, newValue) {
    this[name] = newValue
  }

  fetchEvents() {
    const containsKeywords = (keywords, item) =>
      keywords.some(keyword => item.summary.includes(keyword))
    const isNotCancelled = () => event => event.status !== 'cancelled'
    const isNotExcluded = () => event => !containsKeywords(this.exclude, event)

    const url = this.buildCalendarApiUrl()
    return fetch(url)
      .then(response => response.json())
      .then(events => {
        this.events = events.items
          .filter(isNotCancelled())
          .filter(isNotExcluded())
      })
      .catch(err => {
        console.error(`Fetching data from ${url} failed.`, err.message)
      })
  }

  buildCalendarApiUrl() {
    const queryParams = new URLSearchParams()
    queryParams.append('key', this.apiKey)
    queryParams.append('timeMin', this.config.timeMin)
    queryParams.append('singleEvents', this.config.singleEvents)
    queryParams.append('orderBy', this.config.orderBy)
    const calendarApiBaseUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${this.account}/events`
    )
    calendarApiBaseUrl.search = queryParams.toString()
    if (this.account === 'example') {
      return 'example-response.json'
    }
    return calendarApiBaseUrl.toString()
  }

  attachDOMEvents() {
    const tabAllEvents = this.shadowRoot.getElementById('all-events')
    const tabs = tabAllEvents.parentElement.children
    function activate(element) {
      Array.from(tabs).forEach(tab => tab.classList.remove('is-active'))
      element.classList.add('is-active')
    }
    tabAllEvents.addEventListener('click', _ => {
      this.render(this.everything)
      activate(tabAllEvents)
    })
    this.categories.forEach((category, index) => {
      const categoryElement = this.shadowRoot.getElementById(
        `category-${index}`
      )
      categoryElement.addEventListener('click', _ => {
        this.render(this.containsWordOrEventIsForAllFilter(category))
        activate(categoryElement)
      })
    })
  }

  render(filter) {
    const eventTableBody = this.shadowRoot.getElementById('event-table-body')
    const events = this.events.filter(filter)
    if (events.length < 1) {
      eventTableBody.innerHTML = '<p>Žádné akce</p>'
    } else {
      const renderedEvents = events
        .map(event => {
          const dateFormatter = new DateFormatter(event)
          return `
            <tr>
              <td>${dateFormatter.toString()}</td>
              <td>${event.summary}</td>
            </tr>`
        })
        .join('')
      eventTableBody.innerHTML = renderedEvents
    }
  }

  containsWordOrEventIsForAllFilter(word) {
    return event =>
      event.summary.includes(word) || event.summary.includes(this.allKeyword)
  }

  everything() {
    return event => event
  }

  buildTemplate(categories, calendarId) {
    return `
${styles()}
<div class="tabs is-toggle">
  <ul>
    <li id="all-events" class="is-active">
      <a>Všechny akce</a>
    </li>
    ${categories
      .map((category, index) => {
        return `
        <li id="category-${index}">
          <a>${category}</a>
        </li>
      `
      })
      .join('')}
  </ul>
</div>

<table class="is-striped">
  <thead>
    <tr>
      <th>Termín</th>
      <th>Akce</th>
    </tr>
  </thead>
  <tbody id="event-table-body"></tbody>
</table>

<a
  class="button"
  href="https://calendar.google.com/calendar?cid=${calendarId}"
>
  Přidat tento kalendář do Vašeho Google kalendáře
</a>
`
  }
}

class DateFormatter {
  constructor(event) {
    this.isInDayEvent = Boolean(event.start.dateTime)
    this.event = event
  }

  toString() {
    if (this.isInDayEvent) {
      return this.formatInDayEvent(
        this.event.start.dateTime,
        this.event.end.dateTime
      )
    } else {
      return this.formatWholeDayEvent(
        this.event.start.date,
        this.event.end.date
      )
    }
  }

  formatWholeDayEvent(startDate, endDate) {
    const start = new Date(startDate)
    // Google Calendar API returns a day right after the end
    // of a whole day event
    const end = this.subtractOneDay(new Date(endDate))
    let removePart = ''
    if (start.getFullYear() === end.getFullYear()) {
      if (start.getMonth() === end.getMonth()) {
        // TODO specific for Czech datetime format
        removePart = `${start.getMonth() + 1}. ${start.getFullYear()}`
        if (start.getDate() === end.getDate()) {
          return this.formatDate(start)
        }
      } else {
        removePart = start.getFullYear().toString()
      }
    }
    const from = this.formatDate(start).replace(removePart, '')
    return this.formatFromTo(from, this.formatDate(end))
  }

  formatInDayEvent(startDateTime, endDateTime) {
    const start = new Date(startDateTime)
    const end = new Date(endDateTime)
    const from = this.formatDateTime(start)
    let to = ''
    if (this.datesEqual(start, end)) {
      to = this.formatTime(end)
    } else {
      to = this.formatDateTime(end)
    }
    return this.formatFromTo(from, to)
  }

  formatDate(dateTime) {
    return new Intl.DateTimeFormat('cs', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(dateTime)
  }

  formatDateTime(dateTime) {
    return new Intl.DateTimeFormat('cs', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(dateTime)
  }

  formatTime(dateTime) {
    return new Intl.DateTimeFormat('cs', {
      hour: 'numeric',
      minute: 'numeric',
    }).format(dateTime)
  }

  formatFromTo(from, to) {
    return `${from} - ${to}`
  }

  datesEqual(start, end) {
    return (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDay() === end.getDay()
    )
  }

  subtractOneDay(day) {
    return new Date(day.setDate(day.getDate() - 1))
  }
}

customElements.define(tagName, SkautGoogleEventsTable)

function styles() {
  return `
<style>
:host {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1em;
}

/* tabs */

.tabs:not(:last-child) {
  margin-bottom: 1.5rem;
}

.tabs {
  align-items: stretch;
  display: flex;
  font-size: 1rem;
  justify-content: space-between;
  overflow: hidden;
  white-space: nowrap;
}

.tabs.is-toggle ul {
  border-bottom: none;
}

.tabs ul {
  margin: 0;
  padding: 0;
  align-items: center;
  display: flex;
  flex-grow: 1;
  flex-shrink: 0;
  justify-content: flex-start;
  list-style: none;
}

.tabs.is-toggle li + li {
  margin-left: -1px;
}

.tabs li {
  display: block;
}

.tabs.is-toggle li.is-active a {
  background-color: #3273dc;
  border-color: #3273dc;
  color: #fff;
  z-index: 1;
}

.tabs.is-toggle li:first-child a {
    border-radius: 4px 0 0 4px;
}

.tabs.is-toggle li:last-child a {
  border-radius: 0 4px 4px 0;
}

.tabs li.is-active a {
    border-bottom-color: #3273dc;
    color: #3273dc;
}

.tabs.is-toggle a {
    border-color: #dbdbdb;
    border-style: solid;
    border-width: 1px;
    margin-bottom: 0;
    position: relative;
}

.tabs a {
    align-items: center;
    border-bottom-color: #dbdbdb;
    border-bottom-style: solid;
    border-bottom-width: 1px;
    color: #363636;
    display: flex;
    justify-content: center;
    margin-bottom: -1px;
    padding: .5em 1em;
    vertical-align: top;
    cursor: pointer;
    text-decoration: none;
}

.tabs.is-toggle a:hover {
  background-color: #f5f5f5;
  border-color: #b5b5b5;
  z-index: 2;
}

/* table */

table {
  min-width: 20em;
  color: #363636;
  border-collapse: collapse;
  border-spacing: 0;
}

table:not(:last-child) {
  margin-bottom: 4rem;
}

table th:not([align]) {
  text-align: left;
}

table thead td,
table thead th {
  border-width: 0 0 2px;
}

table td,
table th {
  border: 1px solid #dbdbdb;
  border-width: 0 0 1px;
  padding: .5em .75em;
  vertical-align: top;
}

table.is-striped tbody tr:nth-child(2n) {
  background-color: #fafafa;
}

/* button */

.button {
  border-radius: 4px;
  border: 1px solid #dbdbdb;
  color: #363636;
  padding: 0.5em 1em;
  text-decoration: none;
}

.button:hover {
  border-color: #b5b5b5;
  background-color: #f5f5f5;
  color: #363636;
}

</style>`
}
