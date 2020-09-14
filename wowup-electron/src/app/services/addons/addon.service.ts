import { Injectable } from "@angular/core";
import { AddonStorageService } from "../storage/addon-storage.service";
import { Addon } from "../../entities/addon";
import { WarcraftService } from "../warcraft/warcraft.service";
import { AddonProvider } from "../../addon-providers/addon-provider";
import { CurseAddonProvider } from "../../addon-providers/curse-addon-provider";
import { HttpClient } from "@angular/common/http";
import * as _ from 'lodash';
import * as uuid from 'uuid';
import { WowUpApiService } from "../wowup-api/wowup-api.service";
import { WowClientType } from "app/models/warcraft/wow-client-type";
import { PotentialAddon } from "app/models/wowup/potential-addon";
import { AddonFolder } from "app/models/wowup/addon-folder";
import { AddonChannelType } from "app/models/wowup/addon-channel-type";
import { AddonSearchResult } from "app/models/wowup/addon-search-result";
import { AddonSearchResultFile } from "app/models/wowup/addon-search-result-file";
import { forkJoin, Observable } from "rxjs";
import { map } from "rxjs/operators";
import { CachingService } from "../caching/caching-service";

@Injectable({
  providedIn: 'root'
})
export class AddonService {

  private readonly _addonProviders: AddonProvider[];

  constructor(
    private _addonStorage: AddonStorageService,
    private _cachingService: CachingService,
    private warcraftService: WarcraftService,
    private _wowupApiService: WowUpApiService,
    httpClient: HttpClient
  ) {
    this._addonProviders = [
      new CurseAddonProvider(httpClient, this._cachingService)
    ];
  }

  public async getAddons(clientType: WowClientType, rescan = false): Promise<Addon[]> {
    let addons = this._addonStorage.getAllForClientType(clientType);
    console.log('addons', addons.length)
    if (rescan || !addons.length) {
      this._addonStorage.removeForClientType(clientType);
      addons = await this.getLocalAddons(clientType);
      this._addonStorage.setAll(addons);
    }
    //     RemoveAddons(clientType);
    //     addons = await GetLocalAddons(clientType);
    //     SaveAddons(addons);
    // }

    // await SyncAddons(clientType, addons);

    // return addons;
    return addons;
  }

  public getFeaturedAddons(clientType: WowClientType): Observable<PotentialAddon[]> {
    return forkJoin(this._addonProviders.map(p => p.getFeaturedAddons(clientType)))
      .pipe(
        map(results => {
          return results.flat(1);
        })
      );
  }

  private getAllStoredAddons(clientType: WowClientType) {
    const addons: Addon[] = [];

    this._addonStorage.query(store => {
      for (const result of store) {
        addons.push(result[1] as Addon);
      }
    })

    return addons;
  }

  private async getLocalAddons(clientType: WowClientType): Promise<any> {
    const addonFolders = await this.warcraftService.listAddons(clientType);
    const addons: Addon[] = [];
    console.log('addonFolders', addonFolders);

    for (const folder of addonFolders) {
      try {
        let addon: Addon;

        if (folder.toc.curseProjectId) {
          addon = await this.getCurseAddonById(folder, clientType);
        } else {

        }

        if (!addon) {
          continue;
        }

        addons.push(addon);
      } catch (e) {
        console.error(e);
      }
    }

    return addons;
  }

  private async getCurseAddonById(
    addonFolder: AddonFolder,
    clientType: WowClientType
  ) {
    const curseProvider = this._addonProviders.find(p => p instanceof CurseAddonProvider);
    const searchResult = await curseProvider.getById(addonFolder.toc.curseProjectId, clientType);
    const latestFile = this.getLatestFile(searchResult, AddonChannelType.Stable);
    return this.createAddon(addonFolder.name, searchResult, latestFile, clientType);
  }

  private getLatestFile(searchResult: AddonSearchResult, channelType: AddonChannelType): AddonSearchResultFile {
    return _.flow(
      _.filter((f: AddonSearchResultFile) => f.channelType <= channelType),
      _.first
    )(searchResult.files);
  }

  private createAddon(
    folderName: string,
    searchResult: AddonSearchResult,
    latestFile: AddonSearchResultFile,
    clientType: WowClientType
  ): Addon {
    if (latestFile == null) {
      return null;
    }

    return {
      id: uuid.v4(),
      name: searchResult.name,
      thumbnailUrl: searchResult.thumbnailUrl,
      latestVersion: latestFile.version,
      clientType: clientType,
      externalId: searchResult.externalId,
      folderName: folderName,
      gameVersion: latestFile.gameVersion,
      author: searchResult.author,
      downloadUrl: latestFile.downloadUrl,
      externalUrl: searchResult.externalUrl,
      providerName: searchResult.providerName,
      channelType: AddonChannelType.Stable,
      isIgnored: false,
      autoUpdateEnabled: false,
    };
  }
}