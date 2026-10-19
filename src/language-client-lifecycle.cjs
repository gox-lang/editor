class LanguageClientLifecycle {
  constructor(createClient) {
    if (typeof createClient !== "function") {
      throw new TypeError("createClient must be a function")
    }
    this.createClient = createClient
    this.client = undefined
    this.pending = Promise.resolve()
  }

  start() {
    return this.enqueue(async () => {
      if (this.client) return this.client
      const client = this.createClient()
      this.client = client
      try {
        await client.start()
        return client
      } catch (error) {
        if (this.client === client) this.client = undefined
        throw error
      }
    })
  }

  restart() {
    return this.enqueue(async () => {
      if (!this.client) {
        const client = this.createClient()
        this.client = client
        try {
          await client.start()
          return client
        } catch (error) {
          if (this.client === client) this.client = undefined
          throw error
        }
      }
      await this.client.restart()
      return this.client
    })
  }

  stop() {
    return this.enqueue(async () => {
      const client = this.client
      this.client = undefined
      if (client) await client.stop()
    })
  }

  enqueue(operation) {
    const result = this.pending.then(operation, operation)
    this.pending = result.catch(() => undefined)
    return result
  }
}

module.exports = { LanguageClientLifecycle }
